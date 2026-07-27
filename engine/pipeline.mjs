// ─────────────────────────────────────────────────────────────────────────────
// Pipeline v7 — one command turns a prospect domain into a grounded, art-directed
// website demo. The quality contract is now:
//   live multi-page capture → factual extraction → site strategy → content policy
//   → evidence-driven composition → creative gate → technical QA → publish.
//
// Cached HTML is a FALLBACK, never the preferred source. A homepage-only cache
// starves the generator of services, story, team, reviews, FAQs and photography.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, assemble, assembleSite, recommendRecipe, applyRecipeVariety } from './site-engine.mjs';
import { capture, saveAssets, registrableDomain } from './capture.mjs';
import { detectVertical, buildSections, vary } from './vertical-content.mjs';
import { seedOf, chooseArchetype, chooseStructure } from './variety.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slugify = d => d.replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/.*$/,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase();

// Captured copy is COMPOSED — a site description that already ends in '.' meets
// a generated call-to-action and ships "…as wise as 96.. Call today!". The same
// string reaches the hero subhead, the story body, the meta description and the
// JSON-LD, so it is cleaned once, wherever captured prose enters the profile.
// A real ellipsis is '…' (what trimWords emits) and survives untouched.
const tidyPunct = (s) => (s || '')
  .replace(/\s+([.,!?;:])/g, '$1')          // " ." left by a joined fragment
  .replace(/([.!?])\1+/g, '$1')             // ".." "!!" "??"
  .replace(/\.{2,}/g, '.')                  // "..", "..." → '.'
  .replace(/([.!?])\s*([.,!?;:])/g, '$1')   // ". ," ". !" — keep the first mark
  .replace(/\s{2,}/g, ' ')
  .trim();

function findCapture(slug, domain){
  const cands = [
    `assets/harvest/business/${domain}.html`, `assets/harvest/fc/${domain}.html`,
    `assets/harvest/nucleus/${domain}.html`, `assets/harvest/competitors/${domain}.html`,
    `assets/harvest/pages/${slug}.html`, `assets/captured/${slug}/pages/home.html`,
  ].map(p => path.join(ROOT, p));
  return cands.find(fs.existsSync) || null;
}

function looksShell(html){
  if (!html) return true;
  if (/checking your browser|just a moment|cf-browser-verification|attention required|access denied|enable javascript and cookies|privacy error|your connection is not private|net::err_cert|page not found/i.test(html.slice(0, 6000))) return true;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length < 800;
}

function detectPack(text, over){
  if (over.vertical) return { kind:'vertical', key:over.vertical };
  if (over.tradition) return { kind:'tradition', key:over.tradition };
  const t = text.toLowerCase();
  if (/\b(mass|sacrament|parish|eucharist|diocese)\b/.test(t)) return {kind:'tradition', key:'catholic'};
  if (/\b(elca|lcms|umc|presbyterian|lutheran|methodist|episcopal)\b/.test(t)) return {kind:'tradition', key:'mainline'};
  if (/\b(church|worship|sermon|ministr|gospel|congregation)\b/.test(t)) return {kind:'tradition', key:'contemporary'};
  return { kind:'vertical', key:detectVertical(t) };
}

// ── slot semantics ───────────────────────────────────────────────────────────
// Positional allocation ("the 2nd captured photo goes in the story band") has
// no idea what it is looking at, which is how a law firm's story band ended up
// showing a bird in the sky. The pool now carries per-photo signals, so slots
// can ask for what they MEAN instead of for an index:
//
//   about / story  → the most human frame we captured (highest skin fraction)
//   feature / why-us → work, room, equipment: a photograph with LOW skin
//   money          → whatever honest photograph is left
//   gallery        → photographs only, never stock (it claims to be theirs)
//   band           → pure ambience, so curated stock is the right answer
//
// Graphics (logo tiles, sermon banners, plan cards) are never eligible for any
// of these; they stay in the pool for anything that wants them, but nothing
// that reads as photography will pick one up. When no captured photograph
// qualifies for an ambience slot, curated stock fills it — stock is honest in
// ambience and dishonest in the gallery, and that asymmetry is deliberate.
const SKIN_MIN = 0.06;      // below this there is no person and no warm room in frame

export function planPhotoSlots({ gallery = [], heroImage = null, stock = [], photoMeta = [] } = {}){
  const meta = new Map((photoMeta || []).filter(m => m && m.path).map(m => [m.path, m]));
  const isPhoto = (g) => !(meta.get(g)?.graphic);          // no meta ⇒ treat as photograph
  const skinOf = (g) => { const s = meta.get(g)?.skin; return typeof s === 'number' ? s : 0; };

  const pics = (gallery || []).filter(g => g && g !== heroImage);
  const pool = pics.filter(isPhoto);                        // photographs, capture order
  const stockPool = (stock || []).filter(g => g && g !== heroImage);
  let si = 0;
  const nextStock = () => stockPool[si++] || null;
  const take = (g) => { if (g) pool.splice(pool.indexOf(g), 1); return g; };

  // story band: the most human photograph, or honest ambience stock
  const human = pool.filter(g => skinOf(g) >= SKIN_MIN).sort((a, b) => skinOf(b) - skinOf(a))[0];
  const about = take(human) || nextStock();
  // why-us band: work over faces — the lowest-skin photograph left
  const work = pool.slice().sort((a, b) => skinOf(a) - skinOf(b))[0];
  const feature = take(work) || nextStock();
  // money band: any honest photograph still standing
  const money = take(pool[0]) || nextStock();

  // gallery grid / strip: captured photographs only, and the last one is left
  // for the CTA background when there are enough to spare.
  const galEnd = pool.length >= 4 ? pool.length - 1 : pool.length;
  const galleryPics = pool.slice(0, Math.min(8, galEnd));
  const band = nextStock();

  return { feature, about, money, gallery: galleryPics, band };
}

function defaultSections(pack){
  if (pack.kind !== 'tradition') return {};
  return {
    services:{ kicker:'New here?', title:'What your first visit looks like.', lead:'No pressure — come as you are.',
      items:[
        {h:'Easy to find & park', p:'Clear directions and a warm welcome at the door.'},
        {h:'Come as you are', p:'However long it’s been, you belong here.'},
        {h:'Kids are cared for', p:'Safe, secure check-in for every age.'},
        {h:'About an hour', p:'Music, a down-to-earth message, and you’re free.'},
      ]},
    nextsteps:{}, groups:{}, serve:{}, sermons:{latest:{title:'This week’s message'}}, care:{},
    giving:{kicker:'Give', title:'Generosity, made simple.', lead:'Secure online giving in under a minute.', cta:'Give online'},
    cta:{title:'We saved you a seat.', lead:'Join us this week.'},
  };
}

// ── name↔domain matching (G2) ───────────────────────────────────────────────
// "Does this name belong to this domain?" used to be answered by ANY token of
// >3 chars appearing in the domain string. On wamboltwealth.com that made
// "Carson Wealth" — a completely different firm, served from a mis-filed cache
// — look like a match, because "wealth" is in the domain. Industry words carry
// no identity, so they are filtered out before matching, and what remains must
// clear a real bar: two shared tokens, or one distinctive (>=6-char) one.
const GENERIC_TOKENS = new Set([
  'wealth','health','dental','legal','group','associates','partners','financial',
  'advisor','advisors','service','services','solution','solutions','care','clinic',
  'center','centre','company','insurance','title','law','home','first','american',
  'national','family','management','capital','church','medical','denver','colorado',
]);
const identityTokens = (t) => (t || '').toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length > 3 && !GENERIC_TOKENS.has(w));
function nameMatchesDomain(name, domain){
  const d = (domain || '').toLowerCase();
  const hits = identityTokens(name).filter((w) => d.includes(w));
  return hits.length >= 2 || hits.some((w) => w.length >= 6);
}

function pickName(sig, domain){
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const humanize = d => d.replace(/^www\./,'').replace(/\.[a-z]+$/,'').replace(/[-_.]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const raw = [clean(sig.og_site_name), clean(sig.title || '')].filter(Boolean).join(' | ');
  const parts = raw.split(/[|–—·:]/).map(s=>s.trim()).filter(Boolean)
    .filter((p,i,a)=>a.findIndex(x=>x.toLowerCase()===p.toLowerCase())===i);
  if (!parts.length) return humanize(domain);
  const decap = p => /^[^a-z]+$/.test(p) && p.length > 6
    ? p.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()).replace(/\b(Of|The|And|In|At)\b/g,m=>m.toLowerCase()).replace(/^./,c=>c.toUpperCase())
    : p;
  if (parts.length === 1 && parts[0].length >= 3 && !/^(home|welcome|index)$/i.test(parts[0])) return decap(parts[0]);
  const domMatch = parts.find(p => nameMatchesDomain(p, domain));
  if (domMatch && !/^(home|welcome|index)$/i.test(domMatch)) return decap(domMatch);
  const named = parts.filter(p=>!/,/.test(p) && /[A-Z][a-z]+ [A-Z]/.test(p)).sort((a,b)=>a.length-b.length);
  return decap(named[0] || parts.find(p=>!/^(home|welcome|index)$/i.test(p) && p.length>=3) || humanize(domain));
}

// fallbackArchetype/fallbackStructure now live in variety.mjs — they are the
// POOL PRIMARIES the seed spreads around (shared with the variety-check gate).

const args = process.argv.slice(2);
const domain = args.find(a => !a.startsWith('--'));
const flag = k => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
if (!domain) {
  console.error('usage: node engine/pipeline.mjs <domain> [--vertical X|--tradition Y] [--html path] [--allow-weak]');
  process.exit(1);
}

// AI availability is a property of the RUN, and it changes what this build is
// worth. Say so once, up front, instead of letting a keyless run look identical
// to a fully-gated one in the logs. (Key resolution matches llm-extract.mjs.)
const hasAiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY
  || (() => { try { return /ANTHROPIC(?:_API)?_KEY\s*=\s*\S+/.test(fs.readFileSync(path.join(ROOT, '.sightline.env'), 'utf8')); } catch { return false; } })());
if (!hasAiKey)
  console.log('  ! no ANTHROPIC_API_KEY — LLM extraction, site strategy and the vision gates (logo/hero) are SKIPPED this run; structural + perceptual gates still run.');

const slug = slugify(domain);
const explicitHtml = flag('html');
const cachedPath = explicitHtml || findCapture(slug, domain);
let cachedHtml = cachedPath && fs.existsSync(cachedPath) ? fs.readFileSync(cachedPath, 'utf8') : null;
if (cachedHtml && looksShell(cachedHtml) && !explicitHtml) {
  console.log(`  ! cached capture for ${domain} is a shell/challenge — cache disabled`);
  cachedHtml = null;
}

// QUALITY FIX: live multi-page capture is the primary path. Cache is fallback only.
let cap, src;
if (explicitHtml) {
  cap = await capture(domain, { htmlOverride:cachedHtml });
  src = `explicit-html:${path.basename(explicitHtml)} (single-page by request)`;
} else {
  try {
    cap = await capture(domain, { maxPages:7 });
    src = `live-crawl (${cap.pages.length} pages${cap.pages.some(p=>p.rendered) ? ', rendered' : ''})`;
  } catch (e) {
    if (!cachedHtml) throw e;
    console.log(`  ! live crawl failed (${e.message || e}) — falling back to cached homepage`);
    cap = await capture(domain, { htmlOverride:cachedHtml });
    src = `cache-fallback:${path.basename(cachedPath)} (1 page)`;
  }
}

const sig = cap.sig;

// ── G1: wrong-site guard ────────────────────────────────────────────────────
// Everything downstream assumes the HTML we hold belongs to the domain we were
// asked about. A redirect to an acquirer, a parked domain, or a mis-filed
// cache entry breaks that assumption silently, and the pipeline happily ships
// another company's brand, photos and copy under this prospect's name — the
// worst possible failure for an outreach demo. So we check the page's own
// three statements of identity and stop if ANY of them names someone else.
// finalUrl is authoritative on a live crawl but synthesised in cache mode;
// canonical and og:url tell the truth in both.
{
  const want = registrableDomain(domain);
  const claims = [
    ['final URL', sig.finalUrl],
    ['canonical link', sig.canonical_url],
    ['og:url', sig.og_url],
  ].map(([label, url]) => [label, url, registrableDomain(url)]).filter(([, , host]) => host);
  const foreign = claims.filter(([, , host]) => host !== want);
  if (want && foreign.length) {
    console.error(`\n❌ Wrong-site capture for ${domain} — this page is not ${want}.`);
    for (const [label, url, host] of foreign)
      console.error(`   ${label}: ${url}  → ${host}`);
    console.error('   Building on it would publish another business\'s brand, photos and copy');
    console.error('   under this prospect\'s name. Fix the cache entry or the domain, then re-run.\n');
    process.exit(3);
  }
}

const navText = ((sig.nav_tabs || []).map(t=>t.label).join(' ') + ' ').repeat(3);
let name = pickName(sig, domain);
const pack = detectPack((name + ' ').repeat(5) + (sig.title || '') + ' ' + navText + (sig.visible_text || '').slice(0, 5000), {
  vertical:flag('vertical'), tradition:flag('tradition'),
});
if (pack.kind === 'vertical' && pack.key === 'mortgage' && /\btitle\b|\bescrow\b/i.test(name)) pack.key = 'title';

if (cap.copy?.businessName && cap.copy.businessName.length >= 3) {
  // Same G2 bar as pickName: the LLM's name only displaces the heuristic one
  // when it is the one with real identity evidence for THIS domain.
  if (!nameMatchesDomain(name, domain) && nameMatchesDomain(cap.copy.businessName, domain))
    name = cap.copy.businessName;
}

const { rankPhotosForVertical } = await import('./capture.mjs');
if (pack.kind === 'vertical') cap.photos = rankPhotosForVertical(cap.photos, pack.key);
const assets = await saveAssets(slug, cap, ROOT);
let logo = assets.logo;
if (logo) {
  const { logoMatchesBusiness } = await import('./photo-engine.mjs');
  const ok = await logoMatchesBusiness(path.join(ROOT, logo.replace(/^\//, '')), name);
  if (ok === false) {
    console.log('  ! captured logo rejected by vision gate — using styled wordmark');
    logo = null;
  }
}

const isBiz = pack.kind === 'vertical';
let override = null;
try {
  const ov = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine/content-overrides.json'), 'utf8'));
  if (ov[slug]) override = ov[slug];
} catch {}

// One strategic pass sees the real page set and decides the argument + composition.
let strategy = null;
try {
  const { createSiteStrategy } = await import('./site-strategy.mjs');
  strategy = await createSiteStrategy({
    domain, name, vertical:pack.key,
    pages:cap.docs || [],                      // reuse captured HTML — never re-crawl the prospect
    pageUrls:(cap.pages || []).map(p=>p.url),  // fetch fallback only for pages capture didn't hand over
    extracted:{
      services:cap.copy?.serviceDetails || cap.services || [],
      staff:cap.staff || [],
      testimonials:(cap.reviews || []).slice(0, 6),
      rating:cap.rating || null,
      reviewCount:cap.reviewCount || null,
      hours:cap.hours || [],
      address:cap.facts?.address || '',
      tagline:cap.copy?.tagline || '',
      mission:cap.copy?.mission || '',
      offer:cap.copy?.offer || '',
      differentiators:cap.copy?.differentiators || [],
    },
  });
} catch (e) {
  console.error('site strategy unavailable:', e.message || e);
}

// Legacy content call remains only as a narrow fallback for missing services/copy.
let ai = null;
const needsAI = !override && (cap.services || []).length < 3;
if (!strategy && (needsAI || flag('ai') === 'always')) {
  try {
    const { aiContent } = await import('./ai-content.mjs');
    ai = await aiContent(cap, { name, vertical:pack.key, type:isBiz?'business':'church' });
  } catch {}
}
const aiServices = ai?.services?.length >= 3 ? ai.services : null;

let bizPack = null, bizSections = null;
if (isBiz) {
  const realServices = override?.services?.length
    ? override.services
    : (pack.key === 'retail' && (cap.products || []).length >= 3) ? cap.products
    : (cap.services || []).length >= 3 ? cap.services
    : (aiServices || []);
  const addrParts = (cap.facts?.address || '').split(',').map(x=>x.trim());
  const town = addrParts.length >= 3 ? addrParts[addrParts.length - 2].replace(/\s+[A-Z]{2}\s*\d*$/,'').trim() : '';
  const groundedAbout = tidyPunct(strategy?.aboutBody || cap.copy?.mission || sig.description || '');
  const built = buildSections(pack.key, name, {
    realReviews:[...(cap.reviews || sig.reviews || [])],
    rating:cap.rating, reviewCount:cap.reviewCount,
    realServices, serviceDetails:cap.copy?.serviceDetails || [], slug,
    mission:groundedAbout, town:/^[A-Za-z .'-]{3,25}$/.test(town) ? town : '',
  });
  bizSections = built.sections;
  bizPack = built.pack;

  // Grounding policy: unsupported claims do not ship.
  if (cap.hours?.length) bizSections.hours = { items:cap.hours };
  else delete bizSections.hours;

  const offerText = override?.offer || strategy?.offer || cap.copy?.offer || '';
  if (offerText) {
    const lead = typeof offerText === 'string' ? offerText : offerText.lead || '';
    bizSections.offer = { kicker:'Current offer', title:'A good time to get started.', lead, cta:'Ask about this offer →' };
  } else delete bizSections.offer;

  // A vertical pack that sets money:null has DECIDED this industry has no
  // insurance/financing story (law, accounting, insurance, mortgage, title).
  // The strategist's moneyLead may enrich an existing money section; it must
  // never resurrect one the pack deliberately switched off.
  if (strategy?.moneyLead && bizSections.money) bizSections.money = { ...bizSections.money, lead:strategy.moneyLead };
  else if (!strategy?.moneyLead) delete bizSections.money;

  const groundedPoints = strategy?.featurePoints?.length >= 3
    ? strategy.featurePoints
    : (cap.copy?.differentiators || []).length >= 3 ? cap.copy.differentiators : [];
  if (groundedPoints.length >= 3) {
    bizSections.feature = {
      kicker:'Why us',
      title:strategy?.featureTitle || `What makes ${name} different.`,
      points:groundedPoints,
    };
  } else delete bizSections.feature;

  if (strategy?.trustSignals?.length >= 2) bizSections.trust = { items:strategy.trustSignals };
  else delete bizSections.trust;

  if (strategy?.faq?.length >= 3) bizSections.faq = { title:'Questions, answered.', items:strategy.faq };
  else delete bizSections.faq;

  if (bizSections.about) {
    if (strategy?.aboutTitle) bizSections.about.title = strategy.aboutTitle;
    if (groundedAbout) bizSections.about.body = groundedAbout;
    else delete bizSections.about;
    if (bizSections.about) {
      bizSections.about.stats = cap.rating
        ? [{ v:`${cap.rating}★`, k:cap.reviewCount ? `${cap.reviewCount} reviews` : 'average rating' }]
        : [];
    }
  }
}

const sections = isBiz ? bizSections : defaultSections(pack);
if (cap.staff?.length) sections.team = { items:cap.staff };

const heroHeadline = override?.headline
  || strategy?.heroHeadline
  || ai?.headline
  || (isBiz ? vary(slug, bizPack.heroes || [bizPack.hero])(name)
            : vary(slug, ['You’re welcome here.','Come as you are.','Find your place here.','A church that feels like family.']));
const bookCta = strategy?.primaryCta || (isBiz ? bizPack.bookCta : 'Plan your visit →');
const trimWords = (s, max=160) => {
  s = (s || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/,'') + '…';
};
const heroSub = tidyPunct(override?.subhead
  || strategy?.heroSubhead
  || ai?.subhead
  || cap.copy?.tagline
  || trimWords(cap.copy?.mission)
  || trimWords(sig.description)
  || (isBiz ? 'Tell us what you need — we’ll make the next step clear.' : 'Come as you are.'));

// Churches were the only pack getting NO ambience stock, which left the
// feature/about bands imageless whenever their capture ran thin. stockFor is
// keyed by pack key for both kinds now; the honesty rule is unchanged, because
// it lives in site-engine's photoPlan — stock fills ambience slots only and
// never enters the gallery grid presented as "their photos".
const { stockFor } = await import('./photo-engine.mjs');
const stock = stockFor(pack.key, name + ' ' + slug, ROOT);
const sfx = flag('suffix');
if (sfx && stock.length > 1) {
  const rot = [...sfx].reduce((a,c)=>a+c.charCodeAt(0),0) % stock.length;
  stock.push(...stock.splice(0, rot));
}

// Bytes-per-kilopixel floor: 30 for jpeg/png, but well-compressed formats
// (webp/avif) carry the same detail in far fewer bytes — 12 for those.
const heroGate = m => {
  if (!m || !(m.w >= 1400)) return false;
  const min = /\.(webp|avif)(\?|$)/i.test(m.path || '') ? 12 : 30;
  return (m.bytes / ((m.w * m.h) / 1000)) >= min;
};
const heroMeta = (assets.photoMeta || []).find(m=>m.path===assets.heroImage);
let capturedHero = override?.heroImage || ((!isBiz || heroGate(heroMeta)) ? assets.heroImage : null);
if (isBiz && assets.heroImage && !capturedHero)
  console.log('  ! captured hero failed resolution/detail gate — using curated stock hero');
if (isBiz && capturedHero && !override?.heroImage) {
  const { heroLooksClean } = await import('./photo-engine.mjs');
  const clean = await heroLooksClean(path.join(ROOT, capturedHero.replace(/^\//, '')));
  if (clean === false) {
    console.log('  ! captured hero rejected by vision gate — using curated stock hero');
    capturedHero = null;
  }
}

const profileHero = capturedHero || (isBiz ? (stock[0] || null) : '/assets/stock/church-2.webp');
const profileStock = stock.slice(capturedHero ? 0 : 1);
const photoPlan = planPhotoSlots({
  gallery: assets.gallery, heroImage: profileHero,
  stock: profileStock, photoMeta: assets.photoMeta || [],
});

// the same double-punctuation lands in the meta description and the JSON-LD,
// because both read the captured description — clean it once, at the boundary.
const profile = normalize({ ...sig, description: tidyPunct(sig.description) }, {
  slug, name, logo,
  fonts:cap.fonts.head ? cap.fonts : null,
  phone:cap.facts?.phone || '',
  location:cap.facts?.address || '',
  serviceTimes:(!isBiz && cap.copy?.serviceTimes?.length) ? cap.copy.serviceTimes : [],
  gallery:assets.gallery,
  photoMeta:assets.photoMeta || [],
  photoPlan,
  heroImage:profileHero,
  stock:profileStock,
  hero:{ headline:heroHeadline, sub:heroSub, ctas:[{label:bookCta, href:isBiz?'#book':'#visit'}] },
  sections,
});

// Recipe selection — precedence is STRICT and shared with variety-check.mjs:
//   flags (--archetype/--structure/--theme) > strategy's choice
//   > seeded variety (variety.mjs) over a pool built around the evidence
//     fallback (the old single deterministic value is now the pool primary).
// Strategy structure 'classic'/null = no opinion = variety decides.
const recipe = recommendRecipe(profile);
const seed = seedOf(profile);
let archSrc = 'recommend', structSrc = 'n/a';
if (isBiz) {
  recipe.vertical = pack.key;
  const arch = chooseArchetype({
    seed, flagged:flag('archetype'), strategy:strategy?.archetype || null, vertical:pack.key,
    evidence:{ galleryCount:assets.gallery.length, hasHero:!!profile.heroImage },
  });
  recipe.archetype = arch.value; archSrc = arch.source;
  const struct = chooseStructure({
    seed, flagged:flag('structure'), strategy:strategy?.structure || null,
    evidence:{
      reviews:sections.reviews?.items?.length || 0,
      gallery:assets.gallery.length,
      hasOffer:!!sections.offer,
      hasStory:!!sections.about?.body,
    },
  });
  recipe.structure = struct.value; structSrc = struct.source;
  recipe.mood = 'drift';
} else {
  recipe.tradition = pack.key;
  const archOverride = flag('archetype');
  if (archOverride) { recipe.archetype = archOverride; archSrc = 'flag'; }
  else recipe.archetype = recipe.archetype || 'journey';
  const structOverride = flag('structure');
  if (structOverride) { recipe.structure = structOverride; structSrc = 'flag'; }
}
const themeOverride = flag('theme');
if (themeOverride) recipe.theme = themeOverride;
if (args.includes('--theme-palette')) recipe.useCapturedPalette = false;
// re-seed font pack + rad against the FINAL theme (captured brand font still wins)
applyRecipeVariety(recipe, profile);
console.log(`  choice:   archetype=${recipe.archetype} [${archSrc}] · structure=${recipe.structure || 'classic'} [${structSrc}] · theme=${recipe.theme}${themeOverride ? ' [flag]' : ''}${recipe.fontPack ? ` · font=${recipe.fontPack.font}` : ''} · rad=${recipe.rad}`);

// Creative gate runs BEFORE publishing. Technical QA runs after rendering.
const { creativeGate } = await import('./creative-gate.mjs');
const creative = creativeGate({ profile, recipe, capture:cap, strategy, override, business:isBiz });
if (!creative.pass && !args.includes('--allow-weak')) {
  console.error(`\n❌ Creative gate blocked ${name} (score ${creative.score}/100)`);
  for (const f of creative.fails) console.error('   ✗ ' + f);
  for (const w of creative.warns) console.error('   ⚠ ' + w);
  // Classify before blaming the content: if this run suffered API failures,
  // a degraded crawl, or a cache fallback, the gate verdict is a symptom of
  // INFRA, not proof of thin content. Exit 4 tells release.mjs "retry me";
  // exit 3 stays the honest "this prospect's content really is weak".
  const { infraFailures } = await import('./anthropic.mjs');
  const infra = [...infraFailures];
  if (src.startsWith('cache-fallback')) infra.push('live crawl failed — built from cached homepage only');
  if (cap.crawl?.failed?.length) infra.push(`crawl degraded: ${cap.crawl.failed.length}/${cap.crawl.attempted} subpages unreachable`);
  if (infra.length) {
    console.error('   ── INFRA DEGRADATION detected this run — the block above is likely transient:');
    for (const i of infra) console.error('      · ' + i);
    console.error('   Exiting 4 (infra). A later retry may succeed without any content change.\n');
    process.exit(4);
  }
  console.error('   Fix the capture/content or use --allow-weak for debugging only.\n');
  process.exit(3);
}

const suffix = flag('suffix');
const outSlug = suffix ? `${slug}--${suffix}` : slug;
const outDir = path.join(ROOT, 'demos', outSlug);
fs.mkdirSync(outDir, { recursive:true });
const multipage = args.includes('--pages');
const files = multipage ? assembleSite(profile, recipe) : { 'index.html':assemble(profile, recipe) };
const { inlineAssets } = await import('./inline-assets.mjs');
for (const [file, html] of Object.entries(files))
  fs.writeFileSync(path.join(outDir, file), await inlineAssets(html, outDir, ROOT));

if (multipage) {
  const origin = (process.env.SITE_ORIGIN || 'https://sightline-studio.vercel.app').replace(/\/$/,'');
  const today = new Date().toISOString().slice(0,10);
  const urls = Object.keys(files).map(f =>
    `  <url><loc>${origin}/demos/${slug}/${f === 'index.html' ? '' : f}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}

const { qa } = await import('./qa.mjs');
const qr = await qa(outSlug, { rendered:!args.includes('--no-render-qa') });
console.log(`✓ ${name}
  source:   ${src}
  pack:     ${pack.kind}=${pack.key}${logo?' · logo':''}${assets.gallery.length?` · ${assets.gallery.length} photos`:''}${cap.services?.length?` · ${cap.services.length} real services`:''}${cap.reviews?.length?` · ${cap.reviews.length} real reviews`:''}${cap.staff?.length?` · ${cap.staff.length} staff`:''}${cap.llm?' · extraction-llm':' · heuristics'}${strategy?' · strategy-director':''}
  strategy: ${strategy?.rationale || 'evidence-based fallback routing'}
  recipe:   ${recipe.archetype} · ${recipe.theme} · ${recipe.mood || 'none'} · ${recipe.structure || 'classic'}
  gates:    structural QA ✓ · creative ✓ · photo dedupe/aspect/graphic ✓ · vision (logo+hero) ${hasAiKey?'✓':'SKIPPED (no key)'} · strategy ${strategy?'✓':'skipped'}
  creative: ${creative.pass?'✅':'⚠ debug override'} ${creative.score}/100${creative.warns.map(w=>'\n            ⚠ '+w).join('')}
  published: demos/${outSlug}/index.html
  qa:       ${qr.pass?'✅ pass':'❌ FAIL'}${qr.rendered?'':' (static only)'}${qr.fails.map(f=>'\n            ✗ '+f).join('')}${qr.warns.map(w=>'\n            ⚠ '+w).join('')}`);
if (!qr.pass) process.exit(2);
