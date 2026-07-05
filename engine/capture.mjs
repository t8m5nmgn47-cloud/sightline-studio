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
  for (const bin of CHROME_PATHS) {
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
  try {
    const { chromium } = await import('playwright-core');
    let exe;
    try { exe = await (await import('@sparticuz/chromium')).default.executablePath(); } catch {}
    const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    const html = await page.content();
    await browser.close();
    return html;
  } catch { return null; }
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
const PAGE_WORDS = /about|service|practice|team|staff|meet|doctor|attorney|our[-_]|gallery|photo|portfolio|project|work|menu|contact|location|hour|visit/i;
const SKIP_WORDS = /login|cart|account|privacy|terms|blog|news|event|career|\.pdf|\.jpg|\.png|mailto:|tel:|javascript:|^#/i;

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
      if (r && /text\/css|^$/.test(r.type.split(';')[0]) || r) css += '\n' + (r?.text || '');
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
  return {
    families: ranked.slice(0, 6),
    google: [...gf.keys()],
    // safe-to-echo pairing: only families the prospect ALREADY loads from
    // Google Fonts (so the generated site is guaranteed to render them).
    head: fromGoogle[0] || null,
    body: fromGoogle[1] || fromGoogle[0] || null,
  };
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
  let best = null, bw = 0;
  for (const part of srcset.split(',')) {
    const [u, d] = part.trim().split(/\s+/);
    const w = d && /w$/.test(d) ? parseInt(d) : 0;
    if (!best || w >= bw) { best = u; bw = w; }
  }
  return { url: best, w: bw || null };
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
      add(a.src || a['data-src'] || a['data-lazy-src'], { w, h, alt: a.alt || '' });
    });
    $('[style*="background-image"]').each((_, el) => {
      const m = ((el.attribs || {}).style || '').match(/background-image\s*:\s*url\(['"]?([^'")]+)/i);
      if (m) add(m[1], {});
    });
    $('meta[property="og:image"]').each((_, el) => add((el.attribs || {}).content, {}));
  }
  return [...out.values()].sort((a, b) => ((b.w || 0) * (b.h || 0)) - ((a.w || 0) * (a.h || 0))).slice(0, 20);
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

// ── main capture ─────────────────────────────────────────────────────────────
export async function capture(domain, { render = 'auto', maxPages = 5, htmlOverride = null } = {}) {
  const home = htmlOverride
    ? { url: 'https://' + domain, html: htmlOverride, rendered: false }
    : await getPage('https://' + domain, { render });
  if (!home) throw new Error('could not fetch ' + domain);

  const $home = cheerio.load(home.html);
  const pages = [home];
  if (!htmlOverride) {
    for (const url of pickSubpages($home, home.url, maxPages)) {
      await sleep(250);                                   // be polite
      const p = await getPage(url, { render: 'never' }); // subpages: fetch only
      if (p) pages.push(p);
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

  return {
    domain, pages: pages.map((p) => ({ url: p.url, rendered: p.rendered })),
    sig, fonts, colors,
    logos: rankLogos(sig.logo_candidates),
    photos: extractPhotos($pages, home.url),
    facts: extractFacts($pages),
    jsShell: !!sig.js_shell && !home.rendered,
  };
}

// ── asset download (logo + photos) ───────────────────────────────────────────
async function download(url, dest, { min = 500, max = 4 * 1024 * 1024 } = {}) {
  try {
    const res = await fetch(url, UA);
    if (!res.ok || !/image\//.test(res.headers.get('content-type') || '')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < min || buf.length > max) return null;
    fs.writeFileSync(dest, buf);
    return { bytes: buf.length };
  } catch { return null; }
}

export async function saveAssets(slug, cap, ROOT, { maxPhotos = 8 } = {}) {
  const dir = path.join(ROOT, 'assets/captured', slug);
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  const rel = (p) => '/assets/captured/' + slug + '/' + p;

  let logo = null;
  for (const c of cap.logos) {                            // fall down the ranked list
    const ext = (c.url.split('.').pop() || 'png').split('?')[0].slice(0, 4).toLowerCase();
    if (await download(c.url, path.join(dir, 'logo.' + ext), { min: 400, max: 2 * 1024 * 1024 })) { logo = rel('logo.' + ext); break; }
  }

  const gallery = [];
  let heroImage = null;
  for (const ph of cap.photos) {
    if (gallery.length >= maxPhotos) break;
    const ext = ((ph.url.split('.').pop() || 'jpg').split('?')[0].slice(0, 5).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg');
    const file = `photos/${gallery.length + 1}.${ext}`;
    const got = await download(ph.url, path.join(dir, file), { min: 12000 });   // ≥12 KB = real photo
    if (!got) continue;
    gallery.push(rel(file));
    // hero: first genuinely large landscape-ish photo
    if (!heroImage && (got.bytes > 120000 || (ph.w && ph.w >= 1000 && (!ph.h || ph.w > ph.h)))) heroImage = rel(file);
  }
  return { logo, gallery, heroImage: heroImage || gallery[0] || null };
}

export default { capture, saveAssets };
