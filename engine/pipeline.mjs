// ─────────────────────────────────────────────────────────────────────────────
// Pipeline — one command turns a prospect's domain into a finished, publishable demo.
//   node engine/pipeline.mjs <domain> [--vertical dental|law|medspa] [--tradition catholic|mainline|contemporary] [--html <path>]
// Steps: capture (rendered file → existing capture → raw fetch) → detect pack →
// inject pack-appropriate default sections so the demo is FULL → auto-recommend
// archetype/theme/motion from the real brand → assemble → publish to demos/<slug>/.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { extractSignals } from '../api/_intake.js';
import { normalize, assemble, assembleSite, recommendRecipe, VERTICALS, TRADITIONS } from './site-engine.mjs';
import { capture, saveAssets } from './capture.mjs';
import { detectVertical, buildSections, vary } from './vertical-content.mjs';

import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = { headers:{'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'}, redirect:'follow' };
const slugify = d => d.replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/.*$/,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase();

// find a locally-cached render for this domain (harvest or captured), else null
function findCapture(slug, domain){
  const cands = [
    `assets/harvest/business/${domain}.html`, `assets/harvest/fc/${domain}.html`,
    `assets/harvest/nucleus/${domain}.html`, `assets/harvest/competitors/${domain}.html`,
    `assets/harvest/pages/${slug}.html`, `assets/captured/${slug}/pages/home.html`,
  ].map(p=>path.join(ROOT,p));
  return cands.find(fs.existsSync) || null;
}

async function getHtml(domain, slug, htmlArg){
  if (htmlArg) return { html: fs.readFileSync(htmlArg,'utf8'), src:'--html' };
  const cap = findCapture(slug, domain);
  if (cap) return { html: fs.readFileSync(cap,'utf8'), src:'cache:'+path.basename(cap) };
  const res = await fetch('https://'+domain, UA); return { html: await res.text(), src:'live-fetch', finalUrl:res.url };
}

function detectPack(text, over){
  if (over.vertical) return { kind:'vertical', key:over.vertical };
  if (over.tradition) return { kind:'tradition', key:over.tradition };
  const t = text.toLowerCase();
  // churches keep their fast phrase checks; BUSINESS verticals must go through
  // the SCORED matcher (detectVertical) — a first-match regex here once dressed
  // an ENT practice as a dentist because the word "smile" appeared on the page.
  if (/\b(mass|sacrament|parish|eucharist|diocese)\b/.test(t)) return {kind:'tradition',key:'catholic'};
  if (/\b(elca|lcms|umc|presbyterian|lutheran|methodist|episcopal)\b/.test(t)) return {kind:'tradition',key:'mainline'};
  if (/\b(church|worship|sermon|ministr|gospel|congregation)\b/.test(t)) return {kind:'tradition',key:'contemporary'};
  // business: classify into one of the 11 real verticals from the page text
  return { kind:'vertical', key: detectVertical(t) };
}

// pack-appropriate default sections so an auto-generated demo is complete, not thin
function defaultSections(pack, name){
  if (pack.kind==='tradition'){
    return { services:{kicker:'New here?',title:'What your first visit looks like.',lead:'No pressure — come as you are.',
        items:[{h:'Easy to find & park',p:'Clear directions and a warm welcome at the door.'},{h:'Come as you are',p:'However long it’s been, you belong here.'},{h:'Kids are cared for',p:'Safe, secure check-in for every age.'},{h:'About an hour',p:'Music, a down-to-earth message, and you’re free.'}]},
      nextsteps:{}, groups:{}, serve:{}, sermons:{latest:{title:'This week’s message'}}, care:{},
      giving:{kicker:'Give',title:'Generosity, made simple.',lead:'Secure online giving in under a minute.',cta:'Give online'},
      cta:{title:'We saved you a seat.',lead:'Join us this week.'} };
  }
  // business
  return { book:{title:'Ready when you are.',sub:'Book online in under a minute — new patients & clients welcome.'},
    services:{kicker:'Our services',title:'How we can help.',items:[{h:'Consultations',p:'Start with a friendly, no-pressure visit.'},{h:'Ongoing care',p:'A plan tailored to you, done right.'},{h:'New-client welcome',p:'We make your first visit easy.'}]},
    reviews:{kicker:'What people say',title:`Trusted across the community.`,rating:'4.9',count:'hundreds of',
      items:[{q:'Professional, friendly, and they explained everything. Highly recommend.',name:'Verified client'},{q:'Easy to book and they got me in fast. Great experience.',name:'Verified client'},{q:'Best in the area — I won’t go anywhere else.',name:'Verified client'}]},
    offer:{kicker:'New here?',title:'New-client welcome offer.',lead:'Book this week and we’ll take great care of you.',cta:'Claim it →'},
    hours:{}, money:{kicker:'Affordable',title:'Insurance & financing, made easy.',lead:'We accept most major plans and offer flexible financing.'},
    cta:{title:'Let’s get started.',lead:'Book your first visit — we can’t wait to meet you.'} };
}

// ── run ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const domain = args.find(a=>!a.startsWith('--'));
const flag = k => { const i=args.indexOf('--'+k); return i>-1 ? args[i+1] : null; };
if (!domain){ console.error('usage: node engine/pipeline.mjs <domain> [--vertical X|--tradition Y] [--html path]'); process.exit(1); }

const slug = slugify(domain);
// capture: multi-page crawl + stylesheets + fonts + colours + photos + facts.
// A cached/--html capture short-circuits to single-page mode (no network).
// Junk-cache guard: a cached capture that is really a bot-challenge or JS
// shell (Cloudflare "Checking your browser...", empty SPA shells) must never
// feed site generation — ignore it and crawl live (rendered when Chrome is
// available) instead.
const looksShell = (html) => {
  if (!html) return true;
  if (/checking your browser|just a moment|cf-browser-verification|attention required|access denied|enable javascript and cookies/i.test(html.slice(0, 6000))) return true;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length < 800;
};
const cachedPath = flag('html') || findCapture(slug, domain);
let cachedHtml = cachedPath ? fs.readFileSync(cachedPath, 'utf8') : null;
let ignoredShellCache = false;
if (cachedHtml && looksShell(cachedHtml) && !flag('html')) {
  console.log(`  ! cached capture for ${domain} is a bot-challenge/JS shell — ignoring cache, crawling live`);
  cachedHtml = null; ignoredShellCache = true;
}
const cached = cachedHtml ? cachedPath : null;
const cap = await capture(domain, cachedHtml ? { htmlOverride: cachedHtml } : {});
const src = cached ? 'cache:'+path.basename(cached) : `live-crawl${ignoredShellCache?' (shell cache ignored)':''} (${cap.pages.length} pages${cap.pages[0].rendered ? ', rendered' : ''})`;
const html = null; // page HTML now lives in cap
const sig = cap.sig;
// nav labels are strong classification evidence (a "Shop" tab means a shop) —
// weight them by repeating alongside the page text
const navText = ((sig.nav_tabs||[]).map(t=>t.label).join(' ')+' ').repeat(3);
let name = pickName(sig, domain);
// The business NAME is who they are — it leads the classification text so
// "Homestead Title and Escrow" can't be out-shouted by its own nav's
// "Refinance Order" product links.
const pack = detectPack((name+' ').repeat(5)+(sig.title||'')+' '+navText+(sig.visible_text||'').slice(0,4000), {vertical:flag('vertical'), tradition:flag('tradition')});
// Surgical disambiguation: a mortgage classification with title/escrow in the
// NAME is a title company that processes refinance orders, not a lender.
if (pack.kind==='vertical' && pack.key==='mortgage' && /\btitle\b|\bescrow\b/i.test(name)) pack.key = 'title';
// SEO-spam title guard: when the title-derived name shares no words with the
// domain but the LLM found the official name on the pages (logo/footer/about),
// trust the LLM — "Acacia Dental Group" beats "Englewood CO Dentist".
if (cap.copy?.businessName && cap.copy.businessName.length >= 3) {
  const tokensOf = (t) => t.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const nameMatchesDomain = tokensOf(name).some(w => domain.toLowerCase().includes(w));
  const llmMatchesDomain = tokensOf(cap.copy.businessName).some(w => domain.toLowerCase().includes(w));
  if (!nameMatchesDomain && llmMatchesDomain) name = cap.copy.businessName;
}
function pickName(sig, domain){
  const clean = s => (s||'').replace(/\s+/g,' ').trim();
  const humanize = d => d.replace(/^www\./,'').replace(/\.[a-z]+$/,'').replace(/[-_.]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  // consider BOTH og_site_name and <title> segments — either can hold SEO junk
  const raw = [clean(sig.og_site_name), clean(sig.title||'')].filter(Boolean).join(' | ');
  const parts = raw.split(/[|–—·:]/).map(s=>s.trim()).filter(Boolean)
    .filter((p,i,a)=>a.findIndex(x=>x.toLowerCase()===p.toLowerCase())===i);
  if (!parts.length) return humanize(domain);
  // SHOUTING TITLES read as broken — title-case anything that's all caps
  const decap = p => /^[^a-z]+$/.test(p) && p.length > 6
    ? p.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()).replace(/\b(Of|The|And|In|At)\b/g,m=>m.toLowerCase()).replace(/^./,c=>c.toUpperCase())
    : p;
  if (parts.length===1 && parts[0].length>=3 && !/^(home|welcome|index)$/i.test(parts[0])) return decap(parts[0]);
  // the segment sharing words with the DOMAIN is the real business name —
  // "Englewood CO Dentist | Acacia Dental Group" on acaciadentalgroup.com is
  // Acacia, not the SEO keyword phrase (which mismatches the logo).
  const domMatch = parts.find(p => p.toLowerCase().split(/\s+/).some(w => w.length > 3 && domain.toLowerCase().includes(w.toLowerCase())));
  if (domMatch && !/^(home|welcome|index)$/i.test(domMatch)) return decap(domMatch);
  // prefer a segment that reads like a proper business name: no comma/state, 2+ Title-case words
  const named = parts.filter(p=>!/,/.test(p) && /[A-Z][a-z]+ [A-Z]/.test(p)).sort((a,b)=>a.length-b.length);
  const pick = named[0] || parts.find(p=>!/^(home|welcome|index)$/i.test(p) && p.length>=3) || humanize(domain);
  return decap(pick);
}

// download brand assets: ranked-logo fallback chain + real photos + hero pick.
// Photos are re-ranked for the DETECTED industry first, so the hero shot looks
// like the business (a contractor's crew, not the prettiest random building).
const { rankPhotosForVertical } = await import('./capture.mjs');
if (pack.kind === 'vertical') cap.photos = rankPhotosForVertical(cap.photos, pack.key);
const assets = await saveAssets(slug, cap, ROOT);
let logo = assets.logo;

// Logo sanity (vision, ~1¢): a captured logo bearing a DIFFERENT brand's name
// (vendor badges, partner marks) is worse than no logo — the wordmark takes over.
if (logo) {
  const { logoMatchesBusiness } = await import('./photo-engine.mjs');
  const ok = await logoMatchesBusiness(path.join(ROOT, logo.replace(/^\//, '')), name);
  if (ok === false) { console.log('  ! captured logo rejected by vision gate (different brand) — using styled wordmark'); logo = null; }
}

const isBiz = pack.kind==='vertical';

// Hand-verified content override (highest priority): fixes any prospect whose
// real services didn't extract cleanly. Beats capture, AI, and pack defaults.
let override = null;
try {
  const ov = JSON.parse(fs.readFileSync(path.join(ROOT,'engine/content-overrides.json'),'utf8'));
  if (ov[slug]) override = ov[slug];
} catch {}

// AI content pass: read THEIR real site and write THEIR services/headline in
// their voice. Heuristics-first — only ask AI to fill what capture couldn't,
// so we spend nothing when the site already yielded clean structured content.
// Skipped entirely when a manual override already supplies the content.
// Silent no-op when no ANTHROPIC_KEY is set (engine behaves exactly as before).
let ai = null;
const needsAI = !override && (cap.services || []).length < 3;   // capture found nothing usable
if (needsAI || flag('ai') === 'always') {
  try {
    const { aiContent } = await import('./ai-content.mjs');
    ai = await aiContent(cap, { name, vertical: pack.key, type: pack.kind==='vertical'?'business':'church' });
  } catch {}
}
const aiServices = (ai && ai.services && ai.services.length >= 3) ? ai.services : null;

// Business verticals get an industry-specific content pack (real reviews only —
// nothing fabricated). Churches keep their tradition-based default sections.
let bizPack = null, bizSections = null;
if (isBiz) {
  // Priority: hand-verified override → captured real services → AI → pack defaults.
  const realServices = (override && override.services && override.services.length)
    ? override.services
    : (pack.key === 'retail' && (cap.products || []).length >= 3) ? cap.products
    : (cap.services && cap.services.length >= 3) ? cap.services : (aiServices || []);
  // town from the captured address ("123 Main St, Highlands Ranch, CO 80126" → "Highlands Ranch")
  const addrParts = (cap.facts.address || '').split(',').map(x=>x.trim());
  const town = addrParts.length >= 3 ? addrParts[addrParts.length-2].replace(/\s+[A-Z]{2}\s*\d*$/,'').trim() : '';
  const built = buildSections(pack.key, name, {
    realReviews: cap.reviews || sig.reviews || [], rating: cap.rating, reviewCount: cap.reviewCount,
    realServices, serviceDetails: cap.copy?.serviceDetails || [], slug,
    mission: cap.copy?.mission || '', town: /^[A-Za-z .'-]{3,25}$/.test(town) ? town : '',
  });
  bizSections = built.sections; bizPack = built.pack;
  if (cap.hours && cap.hours.length) bizSections.hours = { items: cap.hours };
  if (cap.copy?.offer) bizSections.offer = { ...(bizSections.offer||{}), lead: cap.copy.offer };
}
const sections = isBiz ? bizSections : defaultSections(pack, name);
// real people (LLM/JSON-LD capture) → team section, church or business alike
if (cap.staff && cap.staff.length) sections.team = { items: cap.staff };
// Headline priority: hand-verified override → AI → slug-hash rotated pack
// variant (neighbouring demos never read identically)
const heroHeadline = (override && override.headline) ? override.headline
  : (ai && ai.headline) ? ai.headline
  : isBiz
    ? vary(slug, bizPack.heroes || [bizPack.hero])(name)
    : vary(slug, ['You’re welcome here.', 'Come as you are.', 'Find your place here.', 'A church that feels like family.']);
const bookCta = isBiz ? bizPack.bookCta : 'Plan your visit →';
// their own voice beats a truncated meta description; cut at a word boundary,
// never mid-word ("spiritu…" reads broken)
const trimWords = (s, max=160) => { s=(s||'').trim(); if(s.length<=max) return s;
  const cut = s.slice(0, max); return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/,'') + '…'; };
const heroSub = cap.copy?.tagline || trimWords(cap.copy?.mission) || trimWords(sig.description)
  || (isBiz?'Modern, friendly service — get in touch in a minute.':'Come as you are.');

// Photo engine: curated vertical stock for ambience slots + hero fallback.
// Captured imagery always wins; stock only fills what capture couldn't.
const { stockFor } = await import('./photo-engine.mjs');
const stock = isBiz ? stockFor(pack.key, name + ' ' + slug, ROOT) : [];

// Photo suitability gate: a full-bleed hero demands both resolution AND detail.
// bytes-per-kilopixel is a cheap blur proxy — soft close-ups compress tiny and
// look bad blown up, so they lose hero duty to curated stock (they still serve
// in smaller feature/gallery crops).
// Variant builds rotate the stock deck by suffix so six structures don't all
// open on the same hero photo.
const sfx = flag('suffix');
if (sfx && stock.length > 1) {
  const rot = [...sfx].reduce((a,c)=>a+c.charCodeAt(0),0) % stock.length;
  stock.push(...stock.splice(0, rot));
}
const heroGate = (m) => m && m.w >= 1400 && (m.bytes / ((m.w * m.h) / 1000)) >= 30;
const heroMeta = (assets.photoMeta || []).find(m => m.path === assets.heroImage);
let capturedHero = (override && override.heroImage) || ((!isBiz || heroGate(heroMeta)) ? assets.heroImage : null);
if (isBiz && assets.heroImage && !capturedHero)
  console.log('  ! captured hero failed the quality gate (low res / soft focus) — using curated stock hero');
// VISION gate (needs ANTHROPIC key, ~1¢): promo banners with baked-in text,
// collages and extreme close-ups pass byte checks but ruin heroes. An AI eye
// rejects them; stock steps in. Their photo still serves smaller sections.
if (isBiz && capturedHero && !(override && override.heroImage)) {
  const { heroLooksClean } = await import('./photo-engine.mjs');
  const clean = await heroLooksClean(path.join(ROOT, capturedHero.replace(/^\//, '')));
  if (clean === false) {
    console.log('  ! captured hero rejected by vision gate (baked-in text / banner / close-up) — using curated stock hero');
    capturedHero = null;
  }
}

const profile = normalize(sig, {
  slug, name, logo,
  fonts: cap.fonts.head ? cap.fonts : null,
  phone: cap.facts.phone || '',
  location: cap.facts.address || '',
  serviceTimes: (!isBiz && cap.copy?.serviceTimes?.length) ? cap.copy.serviceTimes : [],
  gallery: assets.gallery,
  heroImage: capturedHero || (isBiz ? (stock[0] || null) : '/assets/stock/church-2.webp'),
  stock: stock.slice(capturedHero ? 0 : 1),
  // no kick: it repeated the name directly under the nav logo/wordmark
  hero: { headline: heroHeadline,
    sub: (override && override.subhead) ? override.subhead : (ai && ai.subhead) ? ai.subhead : heroSub,
    ctas: [{label: bookCta, href: isBiz?'#book':'#visit'}] },
  sections,
});

const recipe = recommendRecipe(profile);
// Business: FLAGSHIP is the default — the cinematic, editorial signature look.
// The theme/palette still varies with the captured brand (colour, type, radius),
// so no two businesses render alike; the church-derived layouts remain available
// via --archetype for anyone who wants them.
if (pack.kind==='vertical'){ recipe.vertical = pack.key; recipe.archetype='flagship'; if(recipe.mood==='none') recipe.mood='candle'; }
else recipe.tradition = pack.key, recipe.archetype = recipe.archetype||'journey';
// --archetype flagship (or any archetype) overrides the auto pick. Flagship is
// the signature "wow" look; it pairs best with a bold theme + candle motion.
const archOverride = flag('archetype');
if (archOverride){ recipe.archetype = archOverride; if (archOverride==='flagship' && recipe.mood==='none') recipe.mood='candle'; }
const themeOverride = flag('theme');
if (themeOverride) recipe.theme = themeOverride;
const structOverride = flag('structure');
if (structOverride) recipe.structure = structOverride;
if (args.includes('--theme-palette')) recipe.useCapturedPalette = false;

// --pages: full multi-page site (Services/About/Contact with a shared real nav);
// default: single-page demo
const suffix = flag('suffix');
const outSlug = suffix ? `${slug}--${suffix}` : slug;
const outDir = path.join(ROOT,'demos',outSlug); fs.mkdirSync(outDir,{recursive:true});
const multipage = args.includes('--pages');
const files = multipage ? assembleSite(profile, recipe) : { 'index.html': assemble(profile, recipe) };
// self-contained pages: every image inlined as a data URI so the demo renders
// identically as a local file, in a preview pane, or deployed. Never again a
// blank hero because a path didn't resolve.
const { inlineAssets } = await import('./inline-assets.mjs');
for (const [file, html] of Object.entries(files)) fs.writeFileSync(path.join(outDir, file), await inlineAssets(html, outDir, ROOT));
if (multipage) {
  // per-demo sitemap — matters once a demo becomes the client's delivered site
  const origin = (process.env.SITE_ORIGIN || 'https://sightline-studio.vercel.app').replace(/\/$/,'');
  const today = new Date().toISOString().slice(0,10);
  const urls = Object.keys(files).map(f =>
    `  <url><loc>${origin}/demos/${slug}/${f==='index.html'?'':f}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  fs.writeFileSync(path.join(outDir,'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}


// QA gate: static checks always; rendered checks when Chromium is available.
// A failing demo still gets written (so you can inspect it) but exits non-zero.
const { qa } = await import('./qa.mjs');
const qr = await qa(outSlug, { rendered: !args.includes('--no-render-qa') });
console.log(`✓ ${name}
  source:   ${src}
  pack:     ${pack.kind}=${pack.key}${logo?'  · logo':''}${assets.gallery.length?`  · ${assets.gallery.length} photos`:''}${cap.services&&cap.services.length?`  · ${cap.services.length} real services`:''}${cap.reviews&&cap.reviews.length?`  · ${cap.reviews.length} real reviews`:''}${cap.staff&&cap.staff.length?`  · ${cap.staff.length} staff`:''}${cap.fonts.head?`  · font: ${cap.fonts.head}`:''}${cap.facts.phone?'  · phone':''}${cap.facts.address?'  · address':''}${cap.llm?'  · llm':'  · heuristics-only (set ANTHROPIC_API_KEY for full extraction)'}${cap.jsShell?'  · ⚠ JS shell (install Chrome for rendered capture)':''}
  recipe:   ${recipe.archetype} · ${recipe.theme} · ${recipe.mood||'none'}${recipe.vertical?' · '+recipe.vertical:recipe.tradition?' · '+recipe.tradition:''}
  published: demos/${outSlug}/index.html
  qa:       ${qr.pass?'✅ pass':'❌ FAIL'}${qr.rendered?'':' (static only)'}${qr.fails.map(f=>'\n            ✗ '+f).join('')}${qr.warns.map(w=>'\n            ⚠ '+w).join('')}`);
if (!qr.pass) process.exit(2);
