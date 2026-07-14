// ─────────────────────────────────────────────────────────────────────────────
// Capture engine — pulls everything usable from a prospect's real website so
// the generated rebuild is unmistakably THEIRS: nav tabs, logo, brand fonts,
// brand colours, real photos, phone/address/hours, across MULTIPLE pages.
//
// Replaces the old single-page fetch in pipeline.mjs. Key upgrades:
//   • Crawls the homepage + up to 5 key same-site pages (about/services/team/
//     gallery/contact), merging signals across all of them.
//   • Fetches the site's actual stylesheets — where the brand colours and
//     fonts really live (the old regex only saw inline homepage CSS).
//   • Font capture: Google-Fonts families the prospect already loads, plus
//     ranked font-family declarations from their CSS.
//   • Colour capture: CSS custom properties and stylesheet colours (weighted),
//     plus fills from an SVG logo — far stronger signal than raw hex counting.
//   • Logo: candidates scored (json-ld > header img > touch-icon > og > favicon,
//     SVG preferred), downloaded with size sanity checks, with fallback down
//     the candidate list instead of trusting the first URL blindly.
//   • Photos: harvested from <img>/srcset/background-image across all crawled
//     pages, junk filtered, largest-first; the best landscape becomes the hero.
//   • Facts: phone (tel:), email (mailto:), address + hours (JSON-LD),
//     social links — wired into the profile instead of being dropped.
//   • JS-shell sites: falls back to headless Chrome (system Chrome, else
//     playwright-core + @sparticuz/chromium) to get the rendered DOM.
//
// Usage:  const cap = await capture('example.com');
//         const assets = await saveAssets(slug, cap, ROOT);   // downloads
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as cheerio from 'cheerio';
import { extractSignals } from '../api/_intake.js';
import { llmExtract } from './llm-extract.mjs';

const UA = { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' }, redirect: 'follow' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...UA, signal: ac.signal });
    if (!res.ok) return null;
    return { text: await res.text(), finalUrl: res.url, type: res.headers.get('content-type') || '' };
  } catch { return null; }
  finally { clearTimeout(t); }
}

// ── headless render fallback for JS-built sites (Wix/Squarespace/…) ─────────
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
export function renderWithChrome(url) {
  // CHROME_BIN env override is honored first, then the hardcoded fallbacks
  for (const bin of [process.env.CHROME_BIN, ...CHROME_PATHS].filter(Boolean)) {
    if (!fs.existsSync(bin)) continue;
    try {
      return execFileSync(bin, ['--headless=new', '--disable-gpu', '--no-sandbox',
        '--virtual-time-budget=8000', '--timeout=15000', '--dump-dom', url],
        { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    } catch { /* try next */ }
  }
  return null;
}
async function renderWithPlaywright(url) {
  const { chromium } = await import('playwright-core');
  // try playwright's own browser first (npx playwright install chromium), then
  // the @sparticuz serverless binary — either may exist depending on the host
  const attempts = [ { args: ['--no-sandbox', '--single-process', '--disable-gpu'] } ];
  try { const exe = await (await import('@sparticuz/chromium')).default.executablePath();
        attempts.push({ executablePath: exe, args: ['--no-sandbox'] }); } catch {}
  for (const opts of attempts) {
    // browser.close() lives in finally — the old catch-and-continue leaked a
    // headless Chromium on every failed attempt, and under a parallel release
    // those leaks compounded into memory pressure for the whole run.
    let browser = null;
    try {
      browser = await chromium.launch({ headless: true, ...opts });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(1200);
      // nudge lazy-loaders: most stores only hydrate product tiles in-view
      for (let i = 0; i < 3; i++) { await page.evaluate(() => scrollBy(0, 1000)).catch(()=>{}); await page.waitForTimeout(350); }
      return await page.content();
    } catch { /* try next */ }
    finally { if (browser) await browser.close().catch(() => {}); }
  }
  return null;
}
async function getRendered(url) {
  return renderWithChrome(url) || await renderWithPlaywright(url);
}

// text yield check — mirrors extractSignals' js_shell heuristic
const textLen = (html) => { const $ = cheerio.load(html); $('script,style,noscript,svg').remove(); return $('body').text().replace(/\s+/g, ' ').trim().length; };

async function getPage(url, { render = 'auto' } = {}) {
  const r = await fetchText(url);
  let html = r?.text || null, finalUrl = r?.finalUrl || url, rendered = false;
  if (render === 'always' || (render === 'auto' && (!html || textLen(html) < 400))) {
    const dom = await getRendered(url);
    if (dom && textLen(dom) > (html ? textLen(html) : 0)) { html = dom; rendered = true; }
  }
  return html ? { url: finalUrl, html, rendered } : null;
}

// ── crawl: pick the pages that hold real content ─────────────────────────────
const PAGE_WORDS = /about|service|practice|team|staff|meet|doctor|attorney|our[-_]|gallery|photo|portfolio|project|work|menu|contact|location|hour|visit|shop|store|product|collection|review|testimonial|video|media|faq/i;
const SKIP_WORDS = /login|sign[-_ ]?in|cart|checkout|account|privacy|terms|blog|news|event|career|\.pdf|\.jpg|\.png|mailto:|tel:|javascript:|^#/i;

export function pickSubpages($, baseUrl, max = 5) {
  const origin = new URL(baseUrl).origin;
  const seen = new Set();
  const scored = [];
  $('a[href]').each((_, el) => {
    const href = (el.attribs || {}).href || '';
    if (SKIP_WORDS.test(href)) return;
    let u; try { u = new URL(href, baseUrl); } catch { return; }
    if (u.origin !== origin) return;
    u.hash = ''; u.search = '';
    const key = u.href.replace(/\/$/, '');
    if (key === baseUrl.replace(/\/$/, '') || seen.has(key)) return;
    seen.add(key);
    const pathText = (u.pathname + ' ' + $(el).text()).toLowerCase();
    const m = pathText.match(PAGE_WORDS);
    if (!m) return;
    // shallow paths first; content pages score by keyword position
    scored.push({ url: u.href, score: 10 - Math.min(9, u.pathname.split('/').filter(Boolean).length * 2) + (/(about|service|team|gallery)/.test(pathText) ? 4 : 0) });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.url);
}

// ── stylesheets ──────────────────────────────────────────────────────────────
export async function collectCss($, baseUrl, maxSheets = 4) {
  let css = '';
  $('style').each((_, el) => { css += $(el).contents().text() + '\n'; });
  const hrefs = [];
  $('link[rel~="stylesheet"][href]').each((_, el) => hrefs.push((el.attribs || {}).href));
  for (const href of hrefs.slice(0, maxSheets)) {
    try {
      const u = new URL(href, baseUrl).href;
      if (/fonts\.googleapis\.com/.test(u)) continue;      // handled by font parser
      const r = await fetchText(u, 8000);
      // only accept real CSS (or servers that omit content-type) — the old
      // `a && b || a` precedence bug appended HTML error pages into the corpus
      if (r && (!r.type || /text\/css/i.test(r.type.split(';')[0]))) css += '\n' + r.text;
    } catch {}
  }
  // follow @import (WordPress themes often hide brand tokens one level deep)
  const imports = [...css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/gi)].map((m) => m[1]).slice(0, 3);
  for (const href of imports) {
    try {
      const u = new URL(href, baseUrl).href;
      if (/fonts\.googleapis\.com/.test(u)) continue;
      const r = await fetchText(u, 8000);
      if (r && (!r.type || /text\/css/i.test(r.type.split(';')[0]))) css += '\n' + r.text;
    } catch {}
  }
  return css.slice(0, 600000);
}

// ── fonts ────────────────────────────────────────────────────────────────────
const GENERIC = /^(inherit|initial|unset|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|-apple-system|blinkmacsystemfont|segoe ui|arial|helvetica( neue)?|times( new roman)?|georgia|verdana|tahoma|roboto)$/i;
export function extractFonts($pages, css) {
  const gf = new Map();   // families loaded from Google Fonts (guaranteed available)
  const decl = new Map(); // families referenced in CSS
  for (const $ of $pages) {
    $('link[href*="fonts.googleapis.com"]').each((_, el) => {
      const href = (el.attribs || {}).href || '';
      for (const m of href.matchAll(/family=([^&:@]+)/g)) {
        const name = decodeURIComponent(m[1]).replace(/\+/g, ' ').trim();
        if (name) gf.set(name, (gf.get(name) || 0) + 5);
      }
    });
  }
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1].split(',')[0].replace(/['"]/g, '').trim();
    if (first && !GENERIC.test(first) && first.length < 40 && !/^var\(/.test(first)) decl.set(first, (decl.get(first) || 0) + 1);
  }
  const ranked = [...new Map([...decl, ...[...gf].map(([k, v]) => [k, (decl.get(k) || 0) + v])])]
    .sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const fromGoogle = ranked.filter((n) => gf.has(n));
  // Commercial fonts → their closest free Google Fonts equivalent, so a brand
  // set in Proxima Nova or Futura still LOOKS like itself in the demo instead
  // of silently dropping to the template default.
  const mapped = ranked.map(googleEquivalent).filter(Boolean);
  return {
    families: ranked.slice(0, 6),
    google: [...gf.keys()],
    // prefer families the prospect already loads from Google Fonts (exact),
    // then mapped equivalents of their commercial fonts (faithful).
    head: fromGoogle[0] || mapped[0] || null,
    body: fromGoogle[1] || fromGoogle[0] || mapped[1] || mapped[0] || null,
  };
}

// Closest-Google-Font table for the commercial faces small businesses actually
// use (via Squarespace/Wix/Shopify themes). Names already on Google Fonts pass
// through unchanged.
const GOOGLE_FONTS = new Set(['inter','montserrat','lato','poppins','raleway','oswald','merriweather','playfair display','nunito','nunito sans','rubik','work sans','karla','jost','dm sans','dm serif display','source sans 3','source serif 4','libre baskerville','libre franklin','cormorant garamond','eb garamond','crimson text','lora','pt serif','pt sans','bitter','archivo','manrope','mulish','barlow','cabin','quicksand','josefin sans','bricolage grotesque','fraunces','sora','outfit','plus jakarta sans','space grotesque','space grotesk','figtree','albert sans','be vietnam pro','league spartan','abril fatface','bebas neue','anton','fjalla one','yeseva one','marcellus','cinzel','forum','italiana','prata','spectral','zilla slab','roboto slab','arvo','domine','vollkorn']);
const FONT_EQUIV = {
  'proxima nova':'Montserrat','proxima-nova':'Montserrat','gotham':'Montserrat','montserrat alternates':'Montserrat',
  'futura':'Jost','futura pt':'Jost','century gothic':'Jost','avant garde':'Jost','itc avant garde gothic':'Jost',
  'avenir':'Nunito Sans','avenir next':'Nunito Sans','circular':'Rubik','circular std':'Rubik','sofia pro':'Rubik','sofia':'Rubik',
  'graphik':'Inter','helvetica now':'Inter','neue haas grotesk':'Inter','aktiv grotesk':'Inter','acumin pro':'Inter','sf pro display':'Inter','sf pro text':'Inter',
  'brandon grotesque':'Josefin Sans','brandon text':'Josefin Sans',
  'gill sans':'Cabin','myriad pro':'Mulish','frutiger':'Mulish','optima':'Marcellus',
  'din':'Barlow','din pro':'Barlow','din next':'Barlow','trade gothic':'Barlow','univers':'Barlow',
  'garamond':'EB Garamond','adobe garamond':'EB Garamond','adobe garamond pro':'EB Garamond','sabon':'EB Garamond',
  'caslon':'Libre Baskerville','adobe caslon pro':'Libre Baskerville','baskerville':'Libre Baskerville',
  'minion pro':'Source Serif 4','freight text':'Source Serif 4','freight display':'Playfair Display','tiempos':'Source Serif 4',
  'bodoni':'Playfair Display','didot':'Playfair Display','canela':'Fraunces','recoleta':'Fraunces','ivypresto':'Fraunces',
  'bookman':'Lora','palatino':'Lora','georgia pro':'Lora','clarendon':'Zilla Slab','rockwell':'Roboto Slab',
  'interstate':'Libre Franklin','franklin gothic':'Libre Franklin','benton sans':'Libre Franklin',
  'knockout':'Oswald','tungsten':'Oswald','league gothic':'Oswald','compacta':'Anton','impact':'Anton',
};
export function googleEquivalent(family) {
  const k = (family || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!k) return null;
  if (GOOGLE_FONTS.has(k)) return family.trim();
  return FONT_EQUIV[k] || null;
}

// ── colours ──────────────────────────────────────────────────────────────────
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, +v)).toString(16).padStart(2, '0')).join('');
export function extractColors({ html = '', css = '', themeColor = '', svgLogo = '' }) {
  const counts = new Map();
  const bump = (hex, w) => {
    let h = hex.toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
    if (!/^#[0-9a-f]{6}$/.test(h)) return;
    if (['#ffffff', '#000000'].includes(h)) return;
    counts.set(h, (counts.get(h) || 0) + w);
  };
  if (themeColor && /^#/.test(themeColor.trim())) bump(themeColor.trim(), 500);
  for (const m of css.matchAll(/--[\w-]+\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)) bump(m[1], 8);   // design tokens
  for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b/g)) bump(m[0], 2);
  for (const m of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) bump(rgbToHex(m[1], m[2], m[3]), 1);
  for (const m of svgLogo.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)) bump(m[1], 6);  // logo colours
  for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b/g)) bump(m[0], 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([h]) => h);
}

// ── logo scoring ─────────────────────────────────────────────────────────────
const WHY_SCORE = { 'json-ld': 50, 'img-logo': 40, 'apple-touch-icon': 20, 'og-image': 10, favicon: 5 };
export function rankLogos(candidates = []) {
  return [...candidates].map((c) => {
    let s = WHY_SCORE[c.why] || 0;
    if (/\.svg(\?|$)/i.test(c.url)) s += 15;
    else if (/\.png(\?|$)/i.test(c.url)) s += 5;
    if (/sprite|placeholder|blank/i.test(c.url)) s -= 30;
    return { ...c, score: s };
  }).sort((a, b) => b.score - a.score);
}

// ── photos ───────────────────────────────────────────────────────────────────
const JUNK_IMG = /logo|icon|sprite|avatar|badge|pixel|tracking|spinner|loader|arrow|bullet|flag|payment|captcha|\.svg(\?|$)|\.gif(\?|$)/i;
function biggestFromSrcset(srcset) {
  // Prefer the largest `w` width descriptor; else the largest `x` density
  // descriptor; else keep the FIRST entry. (The old `>=` swap meant a
  // descriptor-less srcset always returned the LAST url — often the smallest.)
  let bestW = null, bw = 0, bestX = null, bx = 0, first = null;
  for (const part of srcset.split(',')) {
    const [u, d] = part.trim().split(/\s+/);
    if (!u) continue;
    if (!first) first = u;
    const w = d && /^[\d.]+w$/i.test(d) ? parseFloat(d) : 0;
    const x = d && /^[\d.]+x$/i.test(d) ? parseFloat(d) : 0;
    if (w > bw) { bestW = u; bw = w; }
    if (x > bx) { bestX = u; bx = x; }
  }
  if (bestW) return { url: bestW, w: Math.round(bw) };
  return { url: bestX || first, w: null };
}
export function extractPhotos($pages, baseUrl) {
  const out = new Map();
  const add = (u, meta = {}) => {
    if (!u || /^data:/i.test(u)) return;
    let abs; try { abs = new URL(u, baseUrl).href; } catch { return; }
    if (JUNK_IMG.test(abs)) return;
    const prev = out.get(abs) || {};
    out.set(abs, { url: abs, ...prev, ...meta });
  };
  for (const $ of $pages) {
    $('img').each((_, el) => {
      const a = el.attribs || {};
      const w = parseInt(a.width) || null, h = parseInt(a.height) || null;
      if (w && w < 300) return;                      // skip declared-small images
      if (a.srcset) { const b = biggestFromSrcset(a.srcset); add(b.url, { w: b.w || w, h, alt: a.alt || '' }); }
      // lazy-loader attribute zoo: Slider Revolution (data-lazyload), generic
      // lazyload libs (data-original, data-bg) — sliders hold the photos the
      // business chose to LEAD with, so missing these misses the best shots.
      add(a.src || a['data-src'] || a['data-lazy-src'] || a['data-lazyload'] || a['data-original'] || a['data-bg'], { w, h, alt: a.alt || '' });
    });
    // photos referenced from <style> blocks / inline CSS url(...) — WP themes
    // put section backgrounds (team, projects, values) here.
    for (const m of ($.html() || '').matchAll(/url\((['"]?)(https?:\/\/[^'")]+\.(?:jpe?g|png|webp))\1\)/gi)) add(m[2], {});
    $('[style*="background-image"]').each((_, el) => {
      const m = ((el.attribs || {}).style || '').match(/background-image\s*:\s*url\(['"]?([^'")]+)/i);
      if (m) add(m[1], {});
    });
    $('meta[property="og:image"]').each((_, el) => add((el.attribs || {}).content, {}));
  }
  // Promo/seasonal graphics (raffle banners, holiday popups, coupons) are real
  // <img>s and often huge — but they make a terrible hero and a worse gallery.
  // Detectable from URL + alt text; rank them dead last instead of first.
  const PROMO = /raffle|contest|giveaway|holiday|christmas|santa|xmas|halloween|easter|black.?friday|coupon|special.?offer|promo|sale.?banner|popup|pop-up|flyer|announcement|gift.?card|certificate|award|associat|chapter|accredit|sponsor|member.?of|project.?of.?the.?year/i;
  const isPromo = (p) => PROMO.test(p.url) || PROMO.test(p.alt || '');
  return [...out.values()]
    .map((p) => ({ ...p, promo: isPromo(p) }))
    // unknown-size images (slider/background photos rarely declare w/h) get a
    // NEUTRAL area instead of zero — punishing them to the bottom is how a
    // contractor's crew photo loses to a smaller image with width attributes.
    .sort((a, b) => (a.promo - b.promo) || (areaOf(b) - areaOf(a)))
    // pool cap 36 (was 24): this cut happens on DECLARED dims before real
    // dimensions are probed in saveAssets — a bigger pool keeps more good
    // unknown-dimension photos in play; real-dim gating downstream still filters.
    .slice(0, 36);
}
const areaOf = (p) => (p.w && p.h) ? p.w * p.h : 420000;

// ── industry-aware photo ranking ─────────────────────────────────────────────
// The hero must LOOK like the industry: a contractor leads with crew-on-site,
// a dentist with patients and smiles — not whichever image happens to be
// largest. Scores come from URL + alt keywords; slider/hero filenames get a
// boost because they're what the business itself chose to lead with.
const HERO_HINTS = {
  construction: /crew|jobsite|job-site|\bsite\b|team|construction|project|concrete|steel|excavat|equipment|crane|scaffold|safety|vest|hard.?hat|field|build/i,
  trades:       /crew|team|truck|install|repair|service|tech|work|roof|hvac|plumb/i,
  dental:       /smile|patient|team|office|operatory|chair|doctor|staff|family|hygien/i,
  medical:      /patient|doctor|provider|physician|exam|team|care|clinic|staff|nurse/i,
  optometry:    /exam|frame|glasses|patient|optical|eye|lens|doctor|team/i,
  medspa:       /treatment|spa|client|room|provider|team|facial|skin/i,
  law:          /attorney|team|office|court|partner|staff|lawyer|conference/i,
  childcare:    /class|kids|child|play|teacher|campus|learn|student/i,
  business:     /team|staff|office|store|building|work/i,
};
const LEAD_IMG = /hero|slider|slide[-_0-9]|banner[-_0-9]|carousel|masthead|feature/i;
export function rankPhotosForVertical(photos, vertical) {
  const hint = HERO_HINTS[vertical] || HERO_HINTS.business;
  const score = (p) => {
    const s = p.url + ' ' + (p.alt || '');
    return (p.promo ? -10 : 0) + (hint.test(s) ? 4 : 0) + (LEAD_IMG.test(s) ? 2 : 0);
  };
  return [...photos].sort((a, b) => (score(b) - score(a)) || (areaOf(b) - areaOf(a)));
}

// ── products (retail/e-commerce) ─────────────────────────────────────────────
// A store's "services" are its products. From rendered shop pages, a product
// name is a short Title-Case text node whose surrounding tile also shows a
// price. Works across GoDaddy/Shopify/Woo tile markup without per-platform code.
const PROD_STOP = /quick view|more options|add to cart|most popular|best seller|featured|new arrival|^sale!?$|^shop|^products?$|in stock|out of stock|free shipping|reviews?$|^\$/i;
export function extractProducts($pages, max = 12) {
  const names = new Map();
  for (const $ of $pages) {
    $('h1,h2,h3,h4,h5,a,p,span,div').each((_, el) => {
      const own = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim();
      if (!own || own.length < 10 || own.length > 70) return;
      if (/[$€£]\s?\d/.test(own) || PROD_STOP.test(own)) return;
      if (!/^[A-Z0-9]/.test(own) || own.split(' ').length < 3) return;
      // a real product tile shows a price within a few ancestors
      let p = $(el).parent(), priced = false;
      for (let i = 0; i < 4 && p.length; i++, p = p.parent()) {
        if (/[$€£]\s?\d/.test(p.text())) { priced = true; break; }
      }
      if (!priced) return;
      names.set(own, (names.get(own) || 0) + 1);
    });
  }
  return [...names.keys()].slice(0, max);
}

// ── JSON-LD structured data (address / hours / rating / reviews / geo) ──────
const fmtTime = (t) => {
  const m = String(t||'').match(/^(\d{1,2}):(\d{2})/); if (!m) return t;
  let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
};
export function extractJsonLd($pages) {
  const out = { address: '', hours: [], rating: null, reviewCount: null, reviews: [], geo: null };
  const nodes = [];
  for (const $ of $pages) $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text());
      nodes.push(...(Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j]));
    } catch {}
  });
  const flat = [];
  const walk = (n, d = 0) => { if (!n || typeof n !== 'object' || d > 4) return; flat.push(n); for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v, d + 1); };
  nodes.forEach((n) => walk(n));
  for (const n of flat) {
    if (n.address && !out.address) {
      const a = n.address;
      out.address = typeof a === 'string' ? a
        : [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ');
    }
    if (n.openingHoursSpecification && !out.hours.length) {
      for (const h of [].concat(n.openingHoursSpecification)) {
        const days = [].concat(h.dayOfWeek || []).map((d) => String(d).replace(/.*\//, '').slice(0, 3)).join(', ');
        if (days && h.opens) out.hours.push(`${days} · ${fmtTime(h.opens)} – ${fmtTime(h.closes)}`);
      }
    }
    if (typeof n.openingHours === 'string' && !out.hours.length) out.hours.push(n.openingHours);
    if (Array.isArray(n.openingHours) && !out.hours.length) out.hours.push(...n.openingHours.map(String));
    if (n.aggregateRating && out.rating == null) {
      out.rating = +n.aggregateRating.ratingValue || null;
      out.reviewCount = +(n.aggregateRating.reviewCount || n.aggregateRating.ratingCount) || null;
    }
    if (n.geo && !out.geo && n.geo.latitude) out.geo = { lat: +n.geo.latitude, lng: +n.geo.longitude };
    const body = n.reviewBody || (String(n['@type'] || '') === 'Review' && n.description);
    if (body) out.reviews.push({ q: String(body).replace(/\s+/g, ' ').trim().slice(0, 300), name: (n.author && (n.author.name || (typeof n.author === 'string' ? n.author : ''))) || '' });
  }
  out.hours = [...new Set(out.hours)].slice(0, 7);
  out.reviews = out.reviews.filter((r, i, a) => r.q.length > 20 && a.findIndex((x) => x.q === r.q) === i).slice(0, 6);
  return out;
}

// ── facts (phone / email / socials) ─────────────────────────────────────────
export function extractFacts($pages) {
  const facts = { phone: '', email: '', socials: {} };
  for (const $ of $pages) {
    if (!facts.phone) {
      const tel = $('a[href^="tel:"]').first().attr('href');
      if (tel) facts.phone = decodeURIComponent(tel.slice(4)).replace(/[^\d+() -]/g, '').trim();
    }
    if (!facts.email) {
      const mail = $('a[href^="mailto:"]').first().attr('href');
      if (mail) facts.email = mail.slice(7).split('?')[0].trim();
    }
    $('a[href]').each((_, el) => {
      const href = (el.attribs || {}).href || '';
      for (const s of ['facebook', 'instagram', 'youtube', 'linkedin', 'tiktok', 'yelp']) {
        if (!facts.socials[s] && new RegExp(`${s}\\.com/[^/"]`, 'i').test(href)) facts.socials[s] = href;
      }
    });
  }
  return facts;
}

// ── services (heuristic, no LLM) ─────────────────────────────────────────────
// Pulls the prospect's OWN service names from their pages: a "Services/Practice
// Areas/Treatments/What we do" section's sub-headings and list items, plus nav
// dropdown children. Returns [] when nothing clean is found, so the vertical
// default pack stays in charge.
const SERVICE_SECTION = /services|practice areas|treatments|what we (do|offer)|our (services|work|expertise)|specialt|procedures|programs|areas of practice/i;
const SVC_NOISE = /^(home|about( us)?|contact( us)?|services|our services|blog|news|reviews|testimonials|gallery|team|meet the team|careers|privacy|terms|book|book now|call|menu|search|more|read more|learn more|get started|sign in|log ?in|faq|resources|©|all rights)/i;
const cleanSvc = (s) => (s || '').replace(/\s+/g, ' ').replace(/[|•·»]+/g, '').trim();
function goodService(t) {
  if (!t) return false;
  const w = t.split(/\s+/).length;
  return t.length >= 3 && t.length <= 44 && w <= 6 && !SVC_NOISE.test(t) && /[a-z]/i.test(t) && !/[.?!]$/.test(t) && !/@|http|\d{3}[-.]\d/.test(t);
}
export function extractServices($pages) {
  const found = [];
  const seen = new Set();
  const push = (t) => {
    const c = cleanSvc(t);
    const k = c.toLowerCase();
    if (goodService(c) && !SERVICE_SECTION.test(c) && !seen.has(k)) { seen.add(k); found.push(c); }
  };
  for (const $ of $pages) {
    // (a) headings/anchors that live under a "Services"-ish section heading
    $('h1,h2,h3').each((_, el) => {
      const htext = cleanSvc($(el).text());
      if (!SERVICE_SECTION.test(htext)) return;
      // walk following siblings collecting sub-headings and list items
      let node = $(el).parent();
      node.find('h3,h4,li,.service-title,[class*="service"] h3,[class*="service"] h4').slice(0, 12).each((_, s) => push($(s).text()));
    });
    // (b) explicit service cards by class name
    $('[class*="service"] h2, [class*="service"] h3, [class*="service"] h4, [class*="treatment"] h3, [class*="practice-area"] h3').each((_, s) => push($(s).text()));
    // (c) nav submenu items under a Services parent
    $('nav li, .menu li, header li').each((_, li) => {
      const $li = $(li);
      const parentTxt = cleanSvc($li.children('a').first().text());
      if (SERVICE_SECTION.test(parentTxt)) $li.find('ul a, .sub-menu a').slice(0, 12).each((_, a) => push($(a).text()));
    });
    if (found.length >= 6) break;
  }
  return found.slice(0, 6);
}

// ── main capture ─────────────────────────────────────────────────────────────
export async function capture(domain, { render = 'auto', maxPages = 5, htmlOverride = null } = {}) {
  const home = htmlOverride
    ? { url: 'https://' + domain, html: htmlOverride, rendered: false }
    : await getPage('https://' + domain, { render });
  if (!home) throw new Error('could not fetch ' + domain);

  const $home = cheerio.load(home.html);
  const pages = [home];
  const crawl = { attempted: 0, fetched: 0, failed: [] };
  if (!htmlOverride) {
    // If the homepage needed a headless render (JS-built site), subpages will
    // too — 'auto' renders only when the raw fetch yields thin text, so this
    // costs nothing on server-rendered sites but rescues Wix/Squarespace/etc.
    const subRender = home.rendered ? 'auto' : 'never';
    for (const url of pickSubpages($home, home.url, maxPages)) {
      crawl.attempted++;
      await sleep(250);                                   // be polite
      let p = await getPage(url, { render: subRender });
      if (!p) {
        // A dropped subpage is usually a transient timeout/throttle, and it
        // silently starves extraction downstream. One patient retry, with the
        // render fallback allowed, rescues most of them.
        await sleep(2500);
        p = await getPage(url, { render: 'auto' });
      }
      if (p) { pages.push(p); crawl.fetched++; }
      else {
        crawl.failed.push(url);
        console.error(`  ! capture: subpage unreachable after retry — ${url}`);
      }
    }
  }

  const $pages = pages.map((p) => cheerio.load(p.html));
  const sig = extractSignals(home.html, home.url);        // homepage signals (nav, logo cands, name…)
  // merge nav tabs found on subpages (some sites only render full nav inside)
  for (const p of pages.slice(1)) {
    const s2 = extractSignals(p.html, p.url);
    for (const t of s2.nav_tabs || []) {
      if (!(sig.nav_tabs || []).some((x) => x.label.toLowerCase() === t.label.toLowerCase())) (sig.nav_tabs ||= []).push(t);
    }
  }

  const css = await collectCss($home, home.url);
  const svgLogo = /\.svg/i.test((sig.logo_candidates || [])[0]?.url || '')
    ? (await fetchText((sig.logo_candidates || [])[0].url, 6000))?.text || '' : '';

  const fonts = extractFonts($pages, css);
  const colors = extractColors({ html: home.html, css, themeColor: sig.theme_color, svgLogo });
  if (colors.length) sig.color_signals = colors;          // upgrade the old signal in place

  // structured data: address / hours / rating / real reviews from JSON-LD
  const ld = extractJsonLd($pages);
  const facts = extractFacts($pages);
  if (ld.address) facts.address = ld.address;
  if (ld.hours.length) facts.hours = ld.hours;

  // heuristic extraction first (free), then the LLM pass upgrades it in place
  // when ANTHROPIC_API_KEY is set. LLM output only replaces a field when it
  // found MORE than the heuristic did — never downgrades, never invents.
  let services = extractServices($pages);
  let staff = [], reviews = ld.reviews, hours = ld.hours, copy = {};
  const llm = await llmExtract(pages, { domain });
  if (llm) {
    if (llm.services.length >= Math.max(3, services.length ? 0 : 3) && llm.services.length >= services.length)
      services = llm.services.map((s) => s.h);
    copy.serviceDetails = llm.services;                 // names + descriptions
    if (llm.staff.length) staff = llm.staff;
    if (llm.reviews.length > reviews.length) reviews = llm.reviews;
    if (llm.hours.length && !hours.length) hours = llm.hours;
    if (llm.address && !facts.address) facts.address = llm.address;
    copy.businessName = llm.businessName || '';
    copy.tagline = llm.tagline; copy.mission = llm.mission; copy.offer = llm.offer;
    copy.differentiators = llm.differentiators; copy.serviceTimes = llm.serviceTimes;
  }

  return {
    domain, pages: pages.map((p) => ({ url: p.url, rendered: p.rendered })),
    // full HTML for downstream passes (site-strategy) so nothing re-crawls the
    // prospect; crawl records attempted-vs-fetched so a degraded capture is
    // classifiable as infra instead of masquerading as thin content.
    docs: pages.map((p) => ({ url: p.url, html: p.html })),
    crawl,
    sig, fonts, colors,
    logos: rankLogos(sig.logo_candidates),
    photos: extractPhotos($pages, home.url),
    products: extractProducts($pages),
    services,
    staff, reviews, hours, copy,
    rating: ld.rating, reviewCount: ld.reviewCount, geo: ld.geo,
    facts,
    llm: !!llm,
    jsShell: !!sig.js_shell && !home.rendered,
  };
}

// ── image dimensions from raw bytes (no deps: PNG / JPEG / GIF / WebP) ──────
export function imageDims(buf) {
  try {
    // PNG: IHDR width/height at bytes 16..24 (big-endian)
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50)
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)    // GIF
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    // JPEG: scan markers for SOF0/1/2 (baseline/extended/progressive)
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    // WebP: RIFF....WEBP + VP8/VP8L/VP8X chunk
    if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (fmt === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
      if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
  } catch {}
  return null;
}
export const imageSize = imageDims;   // back-compat alias

// True image extension from magic bytes — never trust the URL's "extension"
// (an extensionless URL once produced "logo.com", which browsers can't render).
export function sniffExt(buf, fallback = 'jpg') {
  if (!buf || buf.length < 12) return fallback;
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('utf8', 0, 200).trimStart().startsWith('<svg') || buf.toString('utf8', 0, 200).includes('<svg')) return 'svg';
  if (buf.toString('ascii', 4, 12) === 'ftypavif') return 'avif';
  return fallback;
}

// A real logo is small-to-medium and usually wide or square — a large
// square-ish JPEG is almost always a photo that lied its way up the ranking.
export function looksLikeLogo(buf, ext) {
  if (ext === 'svg') return true;
  const d = imageDims(buf);
  if (!d || !d.w || !d.h) return false;                    // unreadable → don't trust it
  const ar = d.w / d.h;
  if (d.w < 40 || d.h < 24) return false;                  // favicon-tiny → blurry in a header
  if (d.w > 1400 && d.h > 1400) return false;              // giant square = photo
  if (ext === 'jpg' || ext === 'jpeg') {
    // JPEG logos exist, but a big square JPEG is a photo (logos ship as PNG/SVG)
    if (d.w > 600 && d.h > 600 && ar > 0.7 && ar < 1.4) return false;
  }
  return true;
}

// ── asset download (logo + photos) ───────────────────────────────────────────
async function download(url, dest, { min = 500, max = 4 * 1024 * 1024, minW = 0, validate = null } = {}) {
  try {
    const res = await fetch(url, UA);
    if (!res.ok || !/image\//.test(res.headers.get('content-type') || '')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < min || buf.length > max) return null;
    if (validate && !validate(buf)) return null;          // e.g. logo shape check
    const dims = imageDims(buf);
    if (minW && dims && dims.w < minW) return null;       // too small to use
    // correct the extension from the actual bytes before writing
    const realExt = sniffExt(buf, (dest.split('.').pop() || 'jpg'));
    const fixedDest = dest.replace(/\.[a-z0-9]+$/i, '.' + realExt);
    fs.writeFileSync(fixedDest, buf);
    return { bytes: buf.length, w: dims?.w || null, h: dims?.h || null, ext: realExt, path: fixedDest };
  } catch { return null; }
}

export async function saveAssets(slug, cap, ROOT, { maxPhotos = 8 } = {}) {
  const dir = path.join(ROOT, 'assets/captured', slug);
  try {
    fs.rmSync(path.join(dir, 'photos'), { recursive: true, force: true }); // no stale photos from earlier captures
  } catch (e) {
    console.warn(`  ! could not clear old photos for ${slug} (${e.code}) — overwriting in place`);
  }
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  const rel = (p) => '/assets/captured/' + slug + '/' + p;

  let logo = null;
  for (const c of cap.logos) {                            // fall down the ranked list
    const ext = ((c.url.match(/\.([a-z0-9]{2,4})(?=$|[?\/:#])/i) || [,'png'])[1]).toLowerCase();
    // shape-validate every candidate: a photo pretending to be a logo is worse
    // than no logo (the header falls back to a clean styled wordmark instead)
    const gotLogo = await download(c.url, path.join(dir, 'logo.' + ext),
        { min: 400, max: 2 * 1024 * 1024, validate: (buf) => looksLikeLogo(buf, ext) });
    if (gotLogo) { logo = rel('logo.' + (gotLogo.ext || ext)); break; }
  }

  // photos: probe REAL dimensions from bytes (declared width/height are absent
  // on most <img> tags), gate quality, dedupe near-identical files, then pick
  // the hero from measured size + aspect instead of byte-count guessing.
  const saved = [];
  const seen = new Set();                                  // dedupe by bytes+dims
  for (const ph of cap.photos) {
    if (saved.length >= maxPhotos) break;
    if (ph.promo && saved.length >= 3) continue;   // award/promo slides: last resort only
    const ext = ((ph.url.match(/\.([a-z0-9]{2,4})(?=$|[?\/:#])/i) || [,'jpg'])[1]).toLowerCase();
    const file = `photos/${saved.length + 1}.${ext}`;
    const got = await download(ph.url, path.join(dir, file), { min: 12000, minW: 480 });   // real photo, usable width
    if (!got) continue;
    const realFile = got.ext ? file.replace(/\.[a-z0-9]+$/i, '.' + got.ext) : file;
    const key = `${got.bytes}:${got.w}x${got.h}`;
    if (seen.has(key)) { try { fs.unlinkSync(got.path || path.join(dir, realFile)); } catch {} continue; }
    seen.add(key);
    saved.push({ path: rel(realFile), bytes: got.bytes, w: got.w, h: got.h });
  }
  const gallery = saved.map((s) => s.path);
  // hero: widest landscape photo ≥800px; fall back to the largest file
  const landscape = saved.filter((s) => s.w >= 800 && (!s.h || s.w >= s.h)).sort((a, b) => b.w - a.w);
  const heroImage = landscape[0]?.path
    || saved.slice().sort((a, b) => (b.w || 0) - (a.w || 0) || b.bytes - a.bytes)[0]?.path
    || null;
  return { logo, gallery, heroImage, photoMeta: saved };
}

export default { capture, saveAssets };
