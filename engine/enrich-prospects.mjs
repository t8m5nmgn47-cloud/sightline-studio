// ─────────────────────────────────────────────────────────────────────────────
// Enrich prospects.json in place — no harvest data needed.
// Adds/refreshes per prospect:
//   • assets: the built demo (/<slug>/ or /demos/<slug>/), funnel (/p/<slug>/),
//     teardown — resolved against what actually exists in the repo right now
//   • email: the exact, personalized message we send, grounded in their stored
//     gaps and peer benchmarks, with the demo link inside
// Run after building new demos:  node engine/enrich-prospects.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'engine/preview/prospects.json');
const SITE = 'https://sightline-studio.vercel.app';

const slugify = d => d.replace(/^www\./,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase();
const catLabel = { business: 'businesses', church: 'churches' };

function resolveAssets(domain){
  const slug = slugify(domain);
  const has = p => fs.existsSync(path.join(ROOT, p, 'index.html'));
  return {
    slug,
    demo:     has(slug)             ? '/'+slug+'/'             : has('demos/'+slug) ? '/demos/'+slug+'/' : null,
    funnel:   has('p/'+slug)        ? '/p/'+slug+'/'           : null,
    teardown: has('teardowns/'+slug)? '/teardowns/'+slug+'/'   : null,
  };
}

function buildEmail(r){
  const link = r.assets.funnel ? SITE + r.assets.funnel : r.assets.demo ? SITE + r.assets.demo : null;
  if (!link) return null;
  const isBiz = r.type === 'business';
  const top = (r.competitorGaps || [])[0];
  const bm = r.benchmark || {};
  const hook = r.dead
    ? `Your current site at ${r.domain} is down — a placeholder is standing where your front door should be, so anyone searching for you right now finds nothing.`
    : top
      ? `I pulled up ${r.domain} and noticed it's missing ${top.label.toLowerCase()} — ${top.peerPct}% of ${r.tradition} ${catLabel[r.type]} have it, and it's likely costing you ${isBiz?'customers':'first-time visitors'} every week.`
      : `I scored ${r.domain} against ${bm.catN || 'dozens of'} other ${r.tradition} ${catLabel[r.type]}: ${r.score}/100 vs a ${bm.avg ?? '—'} average.`;
  return {
    subject: r.dead
      ? `${r.name} — your website is down (I built you a new one)`
      : `I rebuilt ${r.name}'s website — it's ready to look at`,
    body:
`Hi — Kris here from Sightline Studio, here in Colorado.

${hook}

So instead of sending a pitch deck, I just built it. Here's ${r.name}'s new site, live right now:

${link}

That's a real, working site — your name, your ${isBiz?'services':'ministries'}, your photos, built for phones and built to be found on Google.${r.assets.teardown?` The same link shows how you stack up against ${isBiz?'your local competitors':'nearby churches'}, measured on public signals.`:''}

If you like it, it's yours: ${isBiz?'we host it, watch it, and market it from $59.99/mo with $0 down':'we host it, keep it fresh, and handle the tech for one simple monthly price'} — and you own the site. If not, no hard feelings; the preview was free.

Worth two minutes? Just reply to this email.

— Kris
Sightline Studio · look sharp, stay safe, get found`,
  };
}

const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let demos = 0, emails = 0;
for (const r of rows){
  r.assets = resolveAssets(r.domain);
  r.email = buildEmail(r);
  if (r.assets.demo || r.assets.funnel) demos++;
  if (r.email) emails++;
}
fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
console.log(`✓ enriched ${rows.length} prospects — ${demos} have a built site linked, ${emails} have a ready-to-send email`);
for (const r of rows.filter(x=>x.assets.demo||x.assets.funnel).slice(0,5))
  console.log(`   ${r.name.padEnd(30)} → ${r.assets.funnel||r.assets.demo}`);
