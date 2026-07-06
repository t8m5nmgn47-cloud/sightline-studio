// ─────────────────────────────────────────────────────────────────────────────
// Pond — capture NEW prospects into prospects.json. Two ways to fill it:
//
//   1. By category + city (free, no API key — OpenStreetMap business registry):
//        node engine/pond.mjs --category dentist --city "Parker, CO"
//        node engine/pond.mjs --category law --city "Castle Rock, CO" --max 20
//      Categories: dentist, medical, optometry, law, accounting, insurance,
//                  medspa, trades, childcare, church
//
//   2. From any list of websites you already have:
//        node engine/pond.mjs --domains firmmedspa.com,castlerockcpa.com
//        node engine/pond.mjs --file my-list.txt          (one domain per line)
//
// Each new prospect is fetched, scored on the same readiness rubric as the
// rest of the pond, tiered (HOT/WARM/…), deduped, then the whole list is
// re-enriched (benchmarks, openers, demo links, send-ready emails).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import { enrich } from './enrich-prospects.mjs';
import { scoreDomain } from './score-prospect.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = path.join(ROOT, 'engine/preview/prospects.json');
const UA = { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' }, redirect: 'follow' };
const OSM_UA = { headers: { 'user-agent': 'SightlineStudio-Prospector/1.0 (kris.emery@brains-and-motion.com)' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// OSM tags per category — where local businesses actually live in the map data
const CATEGORY_TAGS = {
  dentist:   ['amenity=dentist'],
  medical:   ['amenity=doctors', 'amenity=clinic'],
  optometry: ['shop=optician'],
  law:       ['office=lawyer'],
  accounting:['office=accountant'],
  insurance: ['office=insurance'],
  medspa:    ['shop=beauty', 'leisure=spa'],
  trades:    ['craft=plumber', 'craft=electrician', 'craft=hvac', 'craft=roofer', 'shop=doityourself'],
  childcare: ['amenity=kindergarten', 'amenity=childcare'],
  church:    ['amenity=place_of_worship'],
};

const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf('--'+k); return i>-1 ? args[i+1] : null; };
const MAX = +(flag('max') || 25);

const cleanDomain = u => { try { return new URL(/^https?:/.test(u)?u:'https://'+u).hostname.replace(/^www\./,''); } catch { return null; } };
const SOCIAL = /facebook\.|instagram\.|linktr\.ee|yelp\.|google\.|youtube\./i;

// ── source 1: OSM category+city search (free) ────────────────────────────────
async function fromOSM(category, city){
  const tags = CATEGORY_TAGS[category];
  if (!tags) { console.error(`Unknown category "${category}". Options: ${Object.keys(CATEGORY_TAGS).join(', ')}`); process.exit(1); }
  console.log(`◦ locating "${city}"…`);
  const geo = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(city), OSM_UA)).json();
  if (!geo.length) { console.error('Could not find that city.'); process.exit(1); }
  const bb = geo[0].boundingbox; // [s,n,w,e]
  const bbox = `${bb[0]},${bb[2]},${bb[1]},${bb[3]}`;
  const q = `[out:json][timeout:30];(${tags.map(t=>{const [k,v]=t.split('=');return `nwr["${k}"="${v}"]["website"](${bbox});`;}).join('')});out tags ${MAX*3};`;
  console.log(`◦ searching OpenStreetMap for ${category} in ${geo[0].display_name.split(',')[0]}…`);
  await sleep(1100); // Nominatim politeness
  const res = await (await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:'data='+encodeURIComponent(q), ...OSM_UA })).json();
  const out = [];
  const seen = new Set();
  for (const el of res.elements || []){
    const t = el.tags || {};
    const d = cleanDomain(t.website || t['contact:website'] || '');
    if (!d || SOCIAL.test(d) || seen.has(d)) continue;
    seen.add(d);
    out.push({ domain: d, hintName: t.name || null, phone: t.phone || t['contact:phone'] || null });
    if (out.length >= MAX) break;
  }
  console.log(`◦ found ${out.length} with real websites`);
  return out;
}

// ── run ───────────────────────────────────────────────────────────────────────
const category = flag('category'), city = flag('city');
let targets = [];
if (flag('domains')) targets = flag('domains').split(',').map(s=>({domain: cleanDomain(s.trim())})).filter(t=>t.domain);
else if (flag('file')) targets = fs.readFileSync(flag('file'),'utf8').split('\n').map(s=>({domain: cleanDomain(s.trim())})).filter(t=>t.domain);
else if (category && city) targets = await fromOSM(category, city);
else { console.error('usage:\n  node engine/pond.mjs --category dentist --city "Parker, CO" [--max 25]\n  node engine/pond.mjs --domains a.com,b.com\n  node engine/pond.mjs --file list.txt'); process.exit(1); }

const rows = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE,'utf8')) : [];
const have = new Set(rows.map(r=>r.domain));
const fresh = targets.filter(t=>t.domain && !have.has(t.domain));
console.log(`◦ ${targets.length} candidates · ${targets.length-fresh.length} already in the pond · scoring ${fresh.length} new…`);

let added = 0, skipped = 0;
for (const t of fresh){
  process.stdout.write(`  ${t.domain.padEnd(36)}`);
  const row = await scoreDomain(t, { churchHint: category==='church', categoryHint: category });
  if (!row){ console.log('✗ unreachable — skipped'); skipped++; continue; }
  row.platform='pond'; row.capturedAt=new Date().toISOString().slice(0,10); row.verifiedAt=row.capturedAt; rows.push(row); added++;
  console.log(`${row.dead?'✕ DEAD':row.score+'/100'}  [${row.tier}] ${row.type}/${row.tradition}`);
  await sleep(400); // be polite to small-business servers
}

enrich(rows);
const order = { DEAD:0, HOT:1, WARM:2, MILD:3, SERVED:4 };
rows.sort((a,b)=> (order[a.tier]-order[b.tier]) || (a.score-b.score));
fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
console.log(`\n✓ pond now holds ${rows.length} prospects (${added} new, ${skipped} skipped) — benchmarks, openers & emails refreshed.`);
console.log('  Review them in /admin/prospector/ then commit:  git add engine/preview/prospects.json && git commit -m "pond: +'+added+'" && git push');
