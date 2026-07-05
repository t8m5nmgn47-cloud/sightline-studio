// ─────────────────────────────────────────────────────────────────────────────
// Review intelligence — pulls each prospect's public Google rating & review
// count and stores it on prospects.json, where enrich-prospects.mjs turns it
// into peer benchmarks, cold-call openers and email hooks ("you have 9 reviews,
// the local median is 87").
//
// Needs a Google Places API key (free tier covers thousands of lookups/month):
//   1. console.cloud.google.com → create project → enable "Places API"
//   2. Create an API key
//   3. Run:  GOOGLE_PLACES_KEY=your-key node engine/reviews.mjs
//
// Without a key this script explains itself and exits — nothing breaks.
// Options:  --only-missing   (default: refresh everything)
//           --max 20
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrich } from './enrich-prospects.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'engine/preview/prospects.json');
const KEY = process.env.GOOGLE_PLACES_KEY;
const args = process.argv.slice(2);
const onlyMissing = args.includes('--only-missing');
const MAX = +(args[args.indexOf('--max')+1] || 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!KEY){
  console.log(`No GOOGLE_PLACES_KEY set — review intelligence is dormant (everything else works without it).

To switch it on (free tier is plenty):
  1. console.cloud.google.com → new project → enable "Places API"
  2. Credentials → Create API key
  3. GOOGLE_PLACES_KEY=your-key node engine/reviews.mjs

What you get: each prospect's Google rating & review count, peer medians per
category, and outreach that leads with the review gap when it's the sharpest hook.`);
  process.exit(0);
}

const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const targets = rows.filter(r => onlyMissing ? !r.reviews : true).slice(0, MAX);
console.log(`◦ looking up ${targets.length} prospects on Google Places…`);

let got = 0;
for (const r of targets){
  const q = encodeURIComponent(`${r.name} ${r.domain}`);
  try {
    const find = await (await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id,name,rating,user_ratings_total&key=${KEY}`)).json();
    const c = (find.candidates || [])[0];
    if (c && c.user_ratings_total != null){
      r.reviews = { rating: c.rating ?? null, count: c.user_ratings_total, source: 'google', at: new Date().toISOString().slice(0,10) };
      got++;
      console.log(`  ${r.name.padEnd(34)} ${c.rating ?? '—'}★ · ${c.user_ratings_total} reviews`);
    } else {
      console.log(`  ${r.name.padEnd(34)} not found on Maps`);
    }
  } catch (e){ console.log(`  ${r.name.padEnd(34)} lookup failed`); }
  await sleep(120);
}

enrich(rows);
fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
console.log(`\n✓ review intel captured for ${got}/${targets.length} — benchmarks & emails refreshed. Commit prospects.json to publish.`);
