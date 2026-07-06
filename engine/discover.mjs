// ─────────────────────────────────────────────────────────────────────────────
// Discovery — turns "vertical + metro" into a prospect list, for FREE.
// Data source: OpenStreetMap via the Overpass API (no key, no billing).
// Every dentist/lawyer/church/etc. mapped in a metro comes back with name,
// website, phone, and address tags where mapped.
//
//   node engine/discover.mjs --vertical dental --metro "Denver, Colorado"
//   node engine/discover.mjs --vertical church --metro "Colorado Springs" --fetch
//
// Output: engine/preview/discovered-<vertical>-<metro>.json
// With --fetch: also downloads each prospect's homepage into
// assets/harvest/business/ (or assets/harvest/fc/ for churches) so the
// prospector can score them on the next run. Domains already harvested are
// skipped, so re-running only pulls new finds.
//
// Be polite: Overpass is a shared community resource. One query per run,
// results cached, and homepage fetches are throttled.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = { headers: { 'user-agent': 'sightline-studio-discovery/1.0 (small local web studio; contact: kkemery@msn.com)' } };

// vertical → OSM tag selectors
const OSM_TAGS = {
  dental:     ['amenity=dentist', 'healthcare=dentist'],
  medical:    ['amenity=doctors', 'amenity=clinic', 'healthcare=doctor', 'healthcare=clinic'],
  optometry:  ['shop=optician', 'healthcare=optometrist'],
  law:        ['office=lawyer'],
  accounting: ['office=accountant'],
  insurance:  ['office=insurance'],
  mortgage:   ['office=financial_advisor', 'office=mortgage'],
  medspa:     ['shop=beauty', 'leisure=spa'],
  trades:     ['craft=hvac', 'craft=plumber', 'craft=electrician', 'craft=roofer', 'shop=trade'],
  childcare:  ['amenity=childcare', 'amenity=kindergarten'],
  church:     ['amenity=place_of_worship'],
  veterinary: ['amenity=veterinary'],
  business:   ['office=company'],
};

const slugMetro = (m) => m.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const domainOf = (url) => { try { return new URL(/^https?:/i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, ''); } catch { return null; } };

// resolve metro name → bounding area via Nominatim (free, throttled)
async function areaId(metro) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(metro)}`;
  const res = await fetch(u, UA);
  if (!res.ok) throw new Error('nominatim ' + res.status);
  const [hit] = await res.json();
  if (!hit) throw new Error('metro not found: ' + metro);
  // Overpass area id: relation → 3600000000 + id, way → 2400000000 + id
  const base = hit.osm_type === 'relation' ? 3600000000 : hit.osm_type === 'way' ? 2400000000 : null;
  if (!base) throw new Error('metro resolved to a node — try a city or county name');
  return { id: base + hit.osm_id, label: hit.display_name };
}

async function overpass(vertical, area) {
  const tags = OSM_TAGS[vertical];
  if (!tags) throw new Error(`unknown vertical "${vertical}" — one of: ${Object.keys(OSM_TAGS).join(', ')}`);
  const sel = tags.map((t) => { const [k, v] = t.split('=');
    return `nwr["${k}"="${v}"](area.a);`; }).join('\n  ');
  const q = `[out:json][timeout:90];\narea(${area.id})->.a;\n(\n  ${sel}\n);\nout center tags;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { ...UA, method: 'POST', body: 'data=' + encodeURIComponent(q) });
  if (!res.ok) throw new Error('overpass ' + res.status);
  return (await res.json()).elements || [];
}

function toProspects(elements, vertical) {
  const out = new Map();
  for (const el of elements) {
    const t = el.tags || {};
    const name = t.name; if (!name) continue;
    const site = t.website || t['contact:website'] || t.url || '';
    const domain = site ? domainOf(site) : null;
    const addr = [t['addr:housenumber'] && `${t['addr:housenumber']} ${t['addr:street'] || ''}`.trim(), t['addr:city'], t['addr:state'], t['addr:postcode']].filter(Boolean).join(', ');
    const key = domain || name.toLowerCase();
    if (out.has(key)) continue;
    out.set(key, {
      name, domain, vertical,
      phone: t.phone || t['contact:phone'] || '',
      address: addr,
      denomination: t.denomination || t.religion || undefined,
      lat: el.lat || el.center?.lat, lng: el.lon || el.center?.lon,
      noSite: !domain,                       // mapped business with NO website = hottest lead of all
    });
  }
  return [...out.values()];
}

// throttled homepage fetch into the harvest dirs the prospector already reads
async function harvest(prospects, vertical) {
  const dir = path.join(ROOT, vertical === 'church' ? 'assets/harvest/fc' : 'assets/harvest/business');
  fs.mkdirSync(dir, { recursive: true });
  let fetched = 0, skipped = 0, failed = 0;
  for (const p of prospects) {
    if (!p.domain) continue;
    const dest = path.join(dir, p.domain + '.html');
    if (fs.existsSync(dest)) { skipped++; continue; }
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000);
      const res = await fetch('https://' + p.domain, { ...UA, redirect: 'follow', signal: ac.signal });
      clearTimeout(t);
      if (res.ok) { fs.writeFileSync(dest, await res.text()); fetched++; }
      else failed++;
    } catch { failed++; }
    await new Promise((r) => setTimeout(r, 400));        // polite
  }
  return { fetched, skipped, failed };
}

// ── run ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
const vertical = flag('vertical'), metro = flag('metro');
if (!vertical || !metro) {
  console.error('usage: node engine/discover.mjs --vertical <dental|law|church|…> --metro "Denver, Colorado" [--fetch]');
  console.error('verticals: ' + Object.keys(OSM_TAGS).join(', '));
  process.exit(1);
}

const area = await areaId(metro);
console.log(`area: ${area.label}`);
const prospects = toProspects(await overpass(vertical, area), vertical);
const withSite = prospects.filter((p) => p.domain);
const noSite = prospects.filter((p) => p.noSite);

const out = path.join(ROOT, 'engine/preview', `discovered-${vertical}-${slugMetro(metro)}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(prospects, null, 2));

console.log(`DISCOVERED: ${prospects.length} ${vertical} in ${metro}`);
console.log(`  with website: ${withSite.length}   ·   NO WEBSITE (hottest leads): ${noSite.length}`);
console.log(`  saved: ${path.relative(ROOT, out)}`);
if (noSite.length) {
  console.log('  no-site leads (call these first — you ARE their web presence):');
  for (const p of noSite.slice(0, 10)) console.log(`   · ${p.name}${p.phone ? '  ' + p.phone : ''}${p.address ? '  — ' + p.address : ''}`);
}
if (args.includes('--fetch')) {
  console.log('\nharvesting homepages…');
  const h = await harvest(withSite, vertical);
  console.log(`  fetched ${h.fetched} · already had ${h.skipped} · failed ${h.failed}`);
  console.log('  next: node engine/prospector.mjs   (scores the new captures)');
}
