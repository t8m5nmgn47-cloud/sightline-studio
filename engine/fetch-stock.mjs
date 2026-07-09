// ─────────────────────────────────────────────────────────────────────────────
// Stock fetcher — expands assets/stock/ from the free Pexels and Unsplash APIs.
// Real photography for the photo engine's ambience slots (hero/feature/about).
//
//   node engine/fetch-stock.mjs               # top up every vertical to 8 shots
//   node engine/fetch-stock.mjs --per 10      # target 10 per vertical
//   node engine/fetch-stock.mjs --only dental,law
//   node engine/fetch-stock.mjs --dry         # show what would be fetched
//
// KEYS (either or both; free): add to .sightline.env
//   PEXELS_KEY=...       https://www.pexels.com/api/
//   UNSPLASH_KEY=...     https://unsplash.com/developers  (the Access Key)
//
// Behavior: never overwrites existing files — numbering continues after the
// highest existing <prefix>-N.webp. Downloads landscape ≥1600px, converts to
// 2000px-wide WebP (~q76), dedupes by provider photo id, and appends proper
// attribution to assets/stock/CREDITS.md (required by both providers' terms).
// Run this on your Mac — it needs open network access.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STOCK = path.join(ROOT, 'assets/stock');

// prefix (photo-engine naming) → search queries, tried in order for variety
const QUERIES = {
  'dental':                ['modern dental office interior', 'dentist patient smile chair', 'dental clinic bright'],
  'medical':               ['modern medical clinic interior', 'doctor patient consultation warm', 'family medicine exam room'],
  'optometry':             ['optometry eyewear store frames', 'eye exam equipment modern', 'glasses display boutique'],
  'medspa':                ['spa treatment room serene', 'aesthetic clinic modern interior', 'facial treatment calm'],
  'law':                   ['law office interior wood', 'attorney desk books scales', 'modern law firm meeting room'],
  'finance':               ['accountant office desk calm', 'financial planning meeting', 'modern office workspace plants'],
  'insurance-title':       ['handshake office professional', 'signing documents desk', 'family home porch sunny'],
  'childcare':             ['preschool classroom bright colorful', 'children playing learning daycare', 'kids art class'],
  'hvac-home-services':    ['hvac technician working', 'home service repair tools', 'suburban house exterior clean'],
  'landscaping':           ['landscaped backyard garden', 'lawn care green yard', 'stone patio landscaping'],
  'construction-builder':  ['home renovation construction interior', 'modern kitchen remodel', 'builder framing house'],
  'church':                ['church interior light warm', 'community gathering hands', 'stained glass sanctuary'],
};

// ── key resolution (same pattern as ai-content/llm-extract) ──────────────────
function envKey(name){
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.sightline.env'),'utf8')
      .match(new RegExp(name + '\\s*=\\s*(\\S+)'));
    if (m) return m[1];
  } catch {}
  return null;
}

// ── providers ─────────────────────────────────────────────────────────────────
async function searchPexels(key, query, perPage){
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&size=large&per_page=${perPage}`,
    { headers: { Authorization: key } });
  if (!r.ok) { console.error(`  pexels ${r.status} for "${query}"`); return []; }
  const j = await r.json();
  return (j.photos||[]).map(p => ({
    id: 'px'+p.id, w: p.width, h: p.height,
    url: p.src?.original || p.src?.large2x,
    credit: `${p.photographer} (Pexels) — ${p.url}`,
  }));
}

async function searchUnsplash(key, query, perPage){
  const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${perPage}&content_filter=high&client_id=${key}`);
  if (!r.ok) { console.error(`  unsplash ${r.status} for "${query}"`); return []; }
  const j = await r.json();
  return (j.results||[]).map(p => ({
    id: 'us'+p.id, w: p.width, h: p.height,
    url: (p.urls?.raw ? p.urls.raw + '&w=2400&fm=jpg&q=85' : p.urls?.full),
    credit: `${p.user?.name} (Unsplash) — ${p.links?.html}`,
    downloadPing: p.links?.download_location ? p.links.download_location + `&client_id=${key}` : null,
  }));
}

// ── main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf('--'+k); return i>-1 ? args[i+1] : null; };
const PER = parseInt(flag('per')||'8', 10);
const ONLY = flag('only') ? flag('only').split(',').map(s=>s.trim()) : null;
const DRY = args.includes('--dry');

const pexelsKey = envKey('PEXELS_KEY');
const unsplashKey = envKey('UNSPLASH_KEY');
if (!pexelsKey && !unsplashKey){
  console.error('No keys found. Add PEXELS_KEY and/or UNSPLASH_KEY to .sightline.env');
  console.error('  Pexels (free):   https://www.pexels.com/api/');
  console.error('  Unsplash (free): https://unsplash.com/developers');
  process.exit(1);
}

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { console.error('sharp not available — saving originals without WebP conversion'); }

fs.mkdirSync(STOCK, { recursive: true });
const existing = fs.readdirSync(STOCK);
const nextN = (prefix) => {
  const ns = existing.concat(fs.readdirSync(STOCK))
    .filter(f => f.startsWith(prefix+'-'))
    .map(f => parseInt((f.match(new RegExp('^'+prefix+'-(\\d+)\\.'))||[])[1]||'0',10));
  return (ns.length ? Math.max(...ns) : 0) + 1;
};

const credits = [];
for (const [prefix, queries] of Object.entries(QUERIES)){
  if (ONLY && !ONLY.includes(prefix)) continue;
  const have = fs.readdirSync(STOCK).filter(f => f.startsWith(prefix+'-')).length;
  const need = PER - have;
  if (need <= 0) { console.log(`✓ ${prefix}: already has ${have}`); continue; }
  console.log(`${prefix}: have ${have}, fetching ${need} more…`);
  if (DRY) continue;

  // interleave providers for variety; dedupe by id
  const pool = [];
  for (const q of queries){
    if (pexelsKey)   pool.push(...await searchPexels(pexelsKey, q, 10));
    if (unsplashKey) pool.push(...await searchUnsplash(unsplashKey, q, 10));
    if (pool.length >= need * 4) break;                       // enough candidates
  }
  const seen = new Set();
  const candidates = pool.filter(p => p.url && p.w >= 1600 && p.w > p.h && !seen.has(p.id) && seen.add(p.id));

  let added = 0, n = nextN(prefix);
  for (const c of candidates){
    if (added >= need) break;
    try {
      const res = await fetch(c.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 60000) continue;                        // junk guard
      const out = path.join(STOCK, `${prefix}-${n}.webp`);
      if (sharp) await sharp(buf).resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 76 }).toFile(out);
      else fs.writeFileSync(out.replace(/\.webp$/, '.jpg'), buf);
      credits.push(`${prefix}-${n}.webp — ${c.credit}`);
      if (c.downloadPing) fetch(c.downloadPing).catch(()=>{});  // Unsplash API terms: trigger download event
      console.log(`  + ${prefix}-${n}.webp  (${c.credit.split('—')[0].trim()})`);
      n++; added++;
    } catch (e) { console.error(`  ! ${(e.message||e).slice(0,80)}`); }
  }
  if (added < need) console.log(`  ⚠ only found ${added}/${need} usable for ${prefix} — try again with different queries`);
}

if (credits.length){
  fs.appendFileSync(path.join(STOCK, 'CREDITS.md'),
    `\n## Added ${new Date().toISOString().slice(0,10)} by fetch-stock.mjs\n` + credits.map(c=>'- '+c).join('\n') + '\n');
  console.log(`\n✓ ${credits.length} photos added · attribution appended to assets/stock/CREDITS.md`);
  console.log('Review the new shots and delete any that miss the mark — the photo engine uses whatever is in assets/stock/.');
}
