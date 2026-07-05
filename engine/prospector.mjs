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
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
// humanize a domain into a readable name when title/og are missing or junk
function humanize(domain){
  return domain.replace(/\.[a-z]+$/,'').replace(/[-_.]+/g,' ')
    .replace(/\b\w/g, c=>c.toUpperCase()).replace(/\bLlc\b|\bInc\b|\bPc\b/gi,m=>m.toUpperCase());
}
const JUNK_NAME = /^(home ?page|home|welcome|untitled|index|error|checking your browser|just a moment|attention required)$|^\d{3}\b|forbidden|not found|access denied|default web ?site|apache|nginx|test page/i;
const BAD_CAPTURE = /checking your browser|just a moment\.\.\.|attention required|access denied|error 40[34]|cloudflare|are you a (human|robot)|enable javascript to/i;
function niceName($, domain){
  const raw = clean($('meta[property="og:site_name"]').attr('content') || $('title').first().text().split(/[|–—·]/)[0]);
  return (!raw || JUNK_NAME.test(raw) || raw.length<3 || /^https?:|\.(com|org|net)/i.test(raw)) ? humanize(domain) : raw;
}
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
    if (BAD_CAPTURE.test(html)) continue;   // bot-wall / error page — not a valid capture
    const $ = cheerio.load(html);
    const domain = f.replace(/\.html$/,'').replace(/^fc-/,'');
    const name = niceName($, domain);
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
    rows.push({ type:'church', domain, name: name===domain?domain:name, platform, tradition, score: dead?0:r.score, tier, gaps, pitch, dead, dims: r.dims.map(d=>({l:d.label,f:d.found,w:d.why})) });
  }
}
// ── business pass (Business-Readiness) ───────────────────────────────────────
const bizFull = path.join(ROOT, BIZ_SOURCE.dir);
if (fs.existsSync(bizFull)) for (const f of fs.readdirSync(bizFull)){
  if (!f.endsWith('.html')) continue;
  const html = fs.readFileSync(path.join(bizFull, f), 'utf8'); if (html.length < 2000) continue;
  if (BAD_CAPTURE.test(html)) continue;   // bot-wall / error page — not a valid capture
  const $ = cheerio.load(html);
  const domain = f.replace(/\.html$/,'');
  const name = niceName($, domain);
  const bodyText = $('body').text();
  const vertical = detectVertical(name+' '+bodyText.slice(0,4000));
  const r = scoreBusiness(corpusFromPages({home:html}, cheerio, {https:true, mobile:/viewport/.test(html)}));
  const gaps = r.dims.filter(d=>!d.found).map(d=>d.label);
  const tier = r.score < 40 ? 'HOT' : r.score < 60 ? 'WARM' : r.score < 80 ? 'MILD' : 'SERVED';
  const pitch = gaps.length
    ? `Leaking leads — missing ${gaps.slice(0,3).join(', ').toLowerCase()}. Scores ${r.score}/100; each fix is booked revenue.`
    : `Converts well (${r.score}/100) — low priority.`;
  rows.push({ type:'business', domain, name: name===domain?domain:name, platform:'—', tradition:vertical, score:r.score, tier, gaps, pitch, dead:false, dims: r.dims.map(d=>({l:d.label,f:d.found,w:d.why})) });
}
// ── projected value per prospect (the sales goal) ────────────────────────────
// Est. monthly by what they'd realistically land on; businesses attach more add-ons.
const MRR = { dental:249, law:299, medspa:249, business:199, church:99 };
for (const r of rows){
  const base = r.type === 'business' ? (MRR[r.tradition] || MRR.business) : MRR.church;
  r.mrr = base;
  r.annual = base * 12;
  // weaker/dead site → more need → higher close likelihood (capped, honest)
  const need = r.dead ? 0.55 : Math.min(0.6, 0.2 + (100 - r.score) / 100 * 0.45);
  r.winPct = Math.round(need * 100);
  r.expected = Math.round(r.annual * need);   // risk-adjusted annual value
}

// ── cold-call intelligence: category benchmarks + competitor gaps + talking points ──
const cats = {};   // key = type/tradition → peer stats
for (const r of rows){
  const k = r.type+'/'+r.tradition; (cats[k] ??= { scores:[], found:{} , n:0 }).n++;
  cats[k].scores.push(r.score);
  (r.dims||[]).forEach(d=>{ cats[k].found[d.l] = (cats[k].found[d.l]||0) + (d.f?1:0); });
}
const catLabel = { business:'businesses', church:'churches' };
for (const r of rows){
  const c = cats[r.type+'/'+r.tradition];
  const avg = Math.round(c.scores.reduce((s,x)=>s+x,0)/c.scores.length);
  const max = Math.max(...c.scores);
  // features MOST peers have (>=50%) that THIS prospect lacks = "competitors do this, you don't"
  const compGaps = (r.dims||[]).filter(d=>!d.f && (c.found[d.l]/c.n) >= 0.5)
    .map(d=>({ label:d.l, why:d.w, peerPct: Math.round(c.found[d.l]/c.n*100) }))
    .sort((a,b)=>b.peerPct-a.peerPct);
  r.benchmark = { catN:c.n, catLabel:`${r.tradition} ${catLabel[r.type]}`, avg, max, delta:r.score-avg };
  r.competitorGaps = compGaps.slice(0,4);
  r.talkingPoints = (compGaps.length?compGaps:(r.dims||[]).filter(d=>!d.f).map(d=>({label:d.l,why:d.w,peerPct:0}))).slice(0,3);
  // a ready cold-call opener grounded in their real gaps + peer context
  const top = compGaps[0];
  r.opener = r.dead
    ? `Hi — I was looking up ${r.name} online and your website's actually down / a placeholder. Your ${r.tradition} ${r.type==='business'?'competitors':'neighbors'} all have a real one, so you're invisible to anyone searching right now. I already rebuilt a version for you — can I send it over?`
    : top
      ? `Hi — I pulled up ${r.name} and noticed you don't have ${top.label.toLowerCase()}, but ${top.peerPct}% of ${r.tradition} ${catLabel[r.type]} do — it's probably costing you ${r.type==='business'?'bookings':'visitors'} every week. I built a version of your site that fixes it. Two minutes to show you?`
      : `Hi — I looked at ${r.name}'s site (scored it ${r.score}/100 vs a ${avg} average for ${r.tradition} ${catLabel[r.type]}). I rebuilt a sharper version — can I send it over?`;
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
