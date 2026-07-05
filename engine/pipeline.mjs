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
import { normalize, assemble, recommendRecipe, VERTICALS, TRADITIONS } from './site-engine.mjs';
import { capture, saveAssets } from './capture.mjs';
import { detectVertical, buildSections } from './vertical-content.mjs';

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
const cap = await capture(domain, cached ? { htmlOverride: fs.readFileSync(cached, 'utf8') } : {});
const src = cached ? 'cache:'+path.basename(cached) : `live-crawl (${cap.pages.length} pages${cap.pages[0].rendered ? ', rendered' : ''})`;
const html = null; // page HTML now lives in cap
const sig = cap.sig;
const pack = detectPack((sig.title||'')+' '+(sig.visible_text||'').slice(0,4000), {vertical:flag('vertical'), tradition:flag('tradition')});
const name = pickName(sig, domain);
function pickName(sig, domain){
  const clean = s => (s||'').replace(/\s+/g,' ').trim();
  const humanize = d => d.replace(/^www\./,'').replace(/\.[a-z]+$/,'').replace(/[-_.]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const raw = clean(sig.og_site_name) || clean(sig.title||'');
  const parts = raw.split(/[|–—·:]/).map(s=>s.trim()).filter(Boolean);
  if (parts.length===1 && parts[0].length>=3 && !/^(home|welcome|index)$/i.test(parts[0])) return parts[0];
  // prefer a segment that reads like a proper business name: no comma/state, 2+ Title-case words
  const named = parts.filter(p=>!/,/.test(p) && /[A-Z][a-z]+ [A-Z]/.test(p)).sort((a,b)=>a.length-b.length);
  const pick = named[0] || parts.find(p=>!/^(home|welcome|index)$/i.test(p) && p.length>=3);
  return pick || humanize(domain);
}

// download brand assets: ranked-logo fallback chain + real photos + hero pick
const assets = await saveAssets(slug, cap, ROOT);
const logo = assets.logo;

const isBiz = pack.kind==='vertical';
// Business verticals get an industry-specific content pack (real reviews only —
// nothing fabricated). Churches keep their tradition-based default sections.
let bizPack = null, bizSections = null;
if (isBiz) {
  const built = buildSections(pack.key, name, { realReviews: sig.reviews || [], realServices: cap.services || [] });
  bizSections = built.sections; bizPack = built.pack;
}
const heroHeadline = isBiz ? (bizPack.hero(name)) : 'You’re welcome here.';
const bookCta = isBiz ? bizPack.bookCta : 'Plan your visit →';

const profile = normalize(sig, {
  slug, name, logo,
  fonts: cap.fonts.head ? cap.fonts : null,
  phone: cap.facts.phone || '',
  gallery: assets.gallery,
  heroImage: assets.heroImage || (isBiz ? null : '/assets/stock/church-2.webp'),
  hero: { kick: name, headline: heroHeadline,
    sub: (sig.description||'').slice(0,160) || (isBiz?'Modern, friendly service — get in touch in a minute.':'Come as you are.'),
    ctas: [{label: bookCta, href: isBiz?'#book':'#visit'}] },
  sections: isBiz ? bizSections : defaultSections(pack, name),
});

const recipe = recommendRecipe(profile);
// Business: keep the palette-driven archetype (varies by brand colour) instead
// of forcing every business site into the same 'minimal' layout.
if (pack.kind==='vertical') recipe.vertical = pack.key;
else recipe.tradition = pack.key, recipe.archetype = recipe.archetype||'journey';

const site = assemble(profile, recipe);
const outDir = path.join(ROOT,'demos',slug); fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'index.html'), site);
console.log(`✓ ${name}
  source:   ${src}
  pack:     ${pack.kind}=${pack.key}${logo?'  · logo':''}${assets.gallery.length?`  · ${assets.gallery.length} photos`:''}${cap.services&&cap.services.length?`  · ${cap.services.length} real services`:''}${cap.fonts.head?`  · font: ${cap.fonts.head}`:''}${cap.facts.phone?'  · phone':''}${cap.jsShell?'  · ⚠ JS shell (install Chrome for rendered capture)':''}
  recipe:   ${recipe.archetype} · ${recipe.theme} · ${recipe.mood||'none'}${recipe.vertical?' · '+recipe.vertical:recipe.tradition?' · '+recipe.tradition:''}
  published: demos/${slug}/index.html`);
