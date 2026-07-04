// ─────────────────────────────────────────────────────────────────────────────
// Prospector — the lead-gen engine. Point it at rendered church pages (from ANY
// platform footprint) and it scores each on Congregation-Readiness, auto-detects
// tradition (so we score fairly), flags dead/placeholder sites, ranks weakest-first,
// and writes a pitch-ready prospect list. Weak/dead site + real church = our lead.
// ─────────────────────────────────────────────────────────────────────────────
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { scoreCongregation, corpusFromPages } from './congregation.mjs';
import { scoreBusiness } from './business.mjs';

const ROOT = '/Users/kristianemery/sightline-studio';
// business sites (the profit engine) — scored on Business-Readiness (booking/reviews/offer)
const BIZ_SOURCE = { dir:'assets/harvest/business' };
function detectVertical(t){ t=t.toLowerCase();
  if(/dentist|dental|orthodont|smile|invisalign|teeth/.test(t)) return 'dental';
  if(/attorney|law ?firm|lawyer|legal|practice areas|litigation|counsel/.test(t)) return 'law';
  if(/med ?spa|aesthetic|botox|filler|laser|skin ?care|dermatolog/.test(t)) return 'medspa';
  return 'business'; }
// dirs of rendered customer sites, tagged by the platform they were sourced from
const SOURCES = [
  { dir:'assets/harvest/fc',          platform:'FaithConnector' },
  { dir:'assets/harvest/competitors', platform:'FaithConnector' },
  { dir:'assets/harvest/nucleus',     platform:'Nucleus' },
];

const clean = s => (s||'').replace(/\s+/g,' ').trim();
function detectTradition(text){
  const t = text.toLowerCase();
  if (/\b(mass times?|sacrament|parish|eucharist|reconciliation|diocese|ocia|rcia)\b/.test(t)) return 'catholic';
  if (/\b(elca|lcms|umc|pc\(usa\)|pcusa|episcopal|synod)\b/.test(t) || (/\bsunday school|faith formation|adult formation\b/.test(t) && /\b(lutheran|methodist|presbyterian|episcopal)\b/.test(t))) return 'mainline';
  return 'contemporary';
}
const DEAD = /launching soon|coming soon|under construction|site is being built|domain (is )?for sale|godaddy|this domain|parked|account suspended|default web ?site|page not found|404 not found/i;

const rows = [];
for (const { dir, platform } of SOURCES){
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)){
    if (!f.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(full, f), 'utf8');
    const $ = cheerio.load(html);
    const domain = f.replace(/\.html$/,'').replace(/^fc-/,'');
    const name = clean($('meta[property="og:site_name"]').attr('content') || $('title').first().text().split(/[|–—-]/)[0]) || domain;
    const bodyText = $('body').text();
    const dead = DEAD.test(html) || html.length < 60000 && !/service|worship|sunday|give|sermon/i.test(bodyText);
    const tradition = detectTradition(bodyText);
    const corpus = corpusFromPages({home:html}, cheerio, {https:true, mobile:/viewport/.test(html)});
    const r = scoreCongregation(corpus, { tradition });
    const gaps = r.dims.filter(d=>!d.found).map(d=>d.label);
    const tier = dead ? 'DEAD' : r.score < 45 ? 'HOT' : r.score < 62 ? 'WARM' : r.score < 78 ? 'MILD' : 'SERVED';
    const pitch = dead
      ? `${name} has no working website — a dead placeholder where their front door should be.`
      : gaps.length
        ? `Pays for a site but it's missing ${gaps.slice(0,3).join(', ').toLowerCase()} — scores ${r.score}/100 on congregation-readiness.`
        : `Strong site (${r.score}/100) — low priority.`;
    rows.push({ type:'church', domain, name: name===domain?domain:name, platform, tradition, score: dead?0:r.score, tier, gaps, pitch, dead });
  }
}
// ── business pass (Business-Readiness) ───────────────────────────────────────
const bizFull = path.join(ROOT, BIZ_SOURCE.dir);
if (fs.existsSync(bizFull)) for (const f of fs.readdirSync(bizFull)){
  if (!f.endsWith('.html')) continue;
  const html = fs.readFileSync(path.join(bizFull, f), 'utf8'); if (html.length < 2000) continue;
  const $ = cheerio.load(html);
  const domain = f.replace(/\.html$/,'');
  const name = clean($('meta[property="og:site_name"]').attr('content') || $('title').first().text().split(/[|–—-]/)[0]) || domain;
  const bodyText = $('body').text();
  const vertical = detectVertical(name+' '+bodyText.slice(0,4000));
  const r = scoreBusiness(corpusFromPages({home:html}, cheerio, {https:true, mobile:/viewport/.test(html)}));
  const gaps = r.dims.filter(d=>!d.found).map(d=>d.label);
  const tier = r.score < 40 ? 'HOT' : r.score < 60 ? 'WARM' : r.score < 80 ? 'MILD' : 'SERVED';
  const pitch = gaps.length
    ? `Leaking leads — missing ${gaps.slice(0,3).join(', ').toLowerCase()}. Scores ${r.score}/100; each fix is booked revenue.`
    : `Converts well (${r.score}/100) — low priority.`;
  rows.push({ type:'business', domain, name: name===domain?domain:name, platform:'—', tradition:vertical, score:r.score, tier, gaps, pitch, dead:false });
}
// rank: dead first, then weakest score
const order = { DEAD:0, HOT:1, WARM:2, MILD:3, SERVED:4 };
rows.sort((a,b)=> (order[a.tier]-order[b.tier]) || (a.score-b.score));
fs.writeFileSync(path.join(ROOT,'engine/preview/prospects.json'), JSON.stringify(rows,null,2));

const c = t => rows.filter(r=>r.tier===t).length;
console.log(`PROSPECTS: ${rows.length} churches scored`);
console.log(`  🔴 DEAD ${c('DEAD')}  ·  🟠 HOT ${c('HOT')}  ·  🟡 WARM ${c('WARM')}  ·  🟢 MILD ${c('MILD')}  ·  ⚪ SERVED ${c('SERVED')}`);
console.log('  top 10 leads:');
for (const r of rows.slice(0,10)) console.log(`   [${r.tier.padEnd(6)}] ${String(r.score).padStart(3)} ${r.domain.padEnd(28)} (${r.platform}) — missing: ${r.gaps.slice(0,3).join(', ')||'—'}`);
