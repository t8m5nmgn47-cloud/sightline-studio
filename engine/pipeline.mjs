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
  if (/dentist|dental|orthodont|invisalign|smile/.test(t)) return {kind:'vertical',key:'dental'};
  if (/attorney|law ?firm|lawyer|litigation|practice areas|legal/.test(t)) return {kind:'vertical',key:'law'};
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
const cached = flag('html') || findCapture(slug, domain);
const cap = await capture(domain, cached ? { htmlOverride: fs.readFileSync(cached, 'utf8') } : { render: args.includes('--render') ? 'always' : 'auto' });
const src = cached ? 'cache:'+path.basename(cached) : `live-crawl (${cap.pages.length} pages${cap.pages[0].rendered ? ', rendered' : ''})`;
const html = null; // page HTML now lives in cap
const sig = cap.sig;
// nav labels are strong classification evidence (a "Shop" tab means a shop) —
// weight them by repeating alongside the page text
const navText = ((sig.nav_tabs||[]).map(t=>t.label).join(' ')+' ').repeat(3);
const pack = detectPack((sig.title||'')+' '+navText+(sig.visible_text||'').slice(0,4000), {vertical:flag('vertical'), tradition:flag('tradition')});
const name = pickName(sig, domain);
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
  // Score each segment for how much it looks like the actual business NAME:
  // + token overlap with the domain (acaciadentalgroup → "Acacia Dental Group" wins)
  // − geo-SEO patterns ("Englewood CO Dentist", "Dentist in Denver, CO")
  const domTokens = domain.replace(/^www\./,'').replace(/\.[a-z]+$/,'').toLowerCase().match(/[a-z]+/g) || [];
  const GEO = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
  const KEYWORDY = /\b(dentist|dental|attorney|lawyer|law firm|plumber|roofing|hvac|cpa|insurance|mortgage|realtor|med spa|near me|in [A-Z])\b/i;
  const score = p => {
    if (/^(home|welcome|index)$/i.test(p) || p.length<3) return -99;
    const words = p.toLowerCase().match(/[a-z]+/g) || [];
    let s = words.filter(w=>w.length>2 && domTokens.includes(w)).length * 3;   // domain echo = strongest signal
    if (/[A-Z][a-z]+ [A-Z]/.test(p)) s += 1;                                    // reads like a proper name
    if (/,/.test(p)) s -= 2;
    if (GEO.test(p)) s -= 3;                                                    // "… CO …" = SEO string
    if (KEYWORDY.test(p) && !words.some(w=>domTokens.includes(w))) s -= 2;      // industry keyword w/o name
    if (words.length > 6) s -= 1;
    return s;
  };
  const best = parts.map(p=>[p,score(p)]).sort((a,b)=>b[1]-a[1])[0];
  if (best[1] > 0) return decap(best[0]);
  // Title was pure SEO junk ("Englewood CO Dentist"). Mine the page text for a
  // Title-Case phrase whose letters spell the domain: "Acacia Dental Group"
  // ⇐ acaciadentalgroup.com. That's the business's real name, verbatim.
  const dom = domTokens.join('');
  const prose = [sig.description, sig.og_title_tag, (sig.visible_text||'').slice(0,3000)].filter(Boolean).join(' ');
  const mined = (prose.match(/(?:[A-Z][A-Za-z&'’.]+ ){1,4}[A-Z][A-Za-z&'’.]+/g) || [])
    .map(m=>m.trim())
    .find(m=>{ const flat=m.toLowerCase().replace(/[^a-z]/g,''); return flat.length>=6 && (dom.includes(flat)||flat.includes(dom)); });
  return decap(mined || parts.find(p=>score(p)>-2) || humanize(domain));
}

// download brand assets: ranked-logo fallback chain + real photos + hero pick.
// Photos are re-ranked for the DETECTED industry first, so the hero shot looks
// like the business (a contractor's crew, not the prettiest random building).
const { rankPhotosForVertical } = await import('./capture.mjs');
if (pack.kind === 'vertical') cap.photos = rankPhotosForVertical(cap.photos, pack.key);
const assets = await saveAssets(slug, cap, ROOT);
const logo = assets.logo;

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
  const built = buildSections(pack.key, name, {
    realReviews: cap.reviews || sig.reviews || [], rating: cap.rating, reviewCount: cap.reviewCount,
    realServices, serviceDetails: cap.copy?.serviceDetails || [], slug,
    gallery: assets.gallery || [],                    // real photos → gallery + about image
    description: (override && override.about) || (ai && ai.about) || sig.description || '',
    location: cap.facts.address || '',
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

const profile = normalize(sig, {
  slug, name, logo,
  fonts: cap.fonts.head ? cap.fonts : null,
  phone: cap.facts.phone || '',
  location: cap.facts.address || '',
  serviceTimes: (!isBiz && cap.copy?.serviceTimes?.length) ? cap.copy.serviceTimes : [],
  gallery: assets.gallery,
  heroImage: flag('hero') || (override && override.heroImage) || assets.heroImage || (isBiz ? null : '/assets/stock/church-2.webp'),
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

// --pages: full multi-page site (Services/About/Contact with a shared real nav);
// default: single-page demo
const outDir = path.join(ROOT,'demos',slug); fs.mkdirSync(outDir,{recursive:true});
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
const qr = await qa(slug, { rendered: !args.includes('--no-render-qa') });
console.log(`✓ ${name}
  source:   ${src}
  pack:     ${pack.kind}=${pack.key}${logo?'  · logo':''}${assets.gallery.length?`  · ${assets.gallery.length} photos`:''}${cap.services&&cap.services.length?`  · ${cap.services.length} real services`:''}${cap.reviews&&cap.reviews.length?`  · ${cap.reviews.length} real reviews`:''}${cap.staff&&cap.staff.length?`  · ${cap.staff.length} staff`:''}${cap.fonts.head?`  · font: ${cap.fonts.head}`:''}${cap.facts.phone?'  · phone':''}${cap.facts.address?'  · address':''}${cap.llm?'  · llm':'  · heuristics-only (set ANTHROPIC_API_KEY for full extraction)'}${cap.jsShell?'  · ⚠ JS shell (install Chrome for rendered capture)':''}
  recipe:   ${recipe.archetype} · ${recipe.theme} · ${recipe.mood||'none'}${recipe.vertical?' · '+recipe.vertical:recipe.tradition?' · '+recipe.tradition:''}
  published: demos/${slug}/index.html
  qa:       ${qr.pass?'✅ pass':'❌ FAIL'}${qr.rendered?'':' (static only)'}${qr.fails.map(f=>'\n            ✗ '+f).join('')}${qr.warns.map(w=>'\n            ⚠ '+w).join('')}`);
if (!qr.pass) process.exit(2);
