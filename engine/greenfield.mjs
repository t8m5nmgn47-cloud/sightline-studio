// ─────────────────────────────────────────────────────────────────────────────
// Greenfield generator — demos for prospects with NO website at all.
// Discovery (OSM) keeps finding mapped, operating businesses with no web
// presence: the hottest lead category there is, but the pipeline can't touch
// them because there's nothing to capture. This builds a complete demo from
// just their discovery record (name, phone, address, vertical) + the vertical
// content pack. "You have no website. I already built you one." is the
// strongest cold open in the deck.
//
//   node engine/greenfield.mjs engine/preview/discovered-dental-littleton-colorado.json
//   node engine/greenfield.mjs <file> --only "Platte Canyon Dental Care"
//   node engine/greenfield.mjs <file> --pages          # full multi-page sites
//
// Output: demos/<slug>/ per no-site lead, QA-gated like every other demo.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, assemble, assembleSite, THEMES } from './site-engine.mjs';
import { buildSections, vary, PACKS } from './vertical-content.mjs';
import { qa } from './qa.mjs';
import { inlineAssets } from './inline-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// deterministic look per lead — greenfield demos in one metro shouldn't match
const LOOKS = [
  { archetype: 'modern',    theme: 'modern' },
  { archetype: 'editorial', theme: 'heritage' },
  { archetype: 'split',     theme: 'community' },
  { archetype: 'minimal',   theme: 'quiet' },
  { archetype: 'cathedral', theme: 'evergreen' },
];

// curated stock per vertical (assets/stock/) — a greenfield demo must look
// DESIGNED, not empty. Real client photos replace these the moment they sign.
const STOCK = {
  dental: 'dental', medical: 'medical', optometry: 'optometry', law: 'law',
  accounting: 'finance', insurance: 'insurance-title', mortgage: 'finance',
  title: 'insurance-title', medspa: 'medspa', trades: 'hvac-home-services',
  childcare: 'childcare', church: 'church', business: 'finance',
};
function stockImages(vertical, ROOT) {
  const base = STOCK[vertical] || 'finance';
  return [1, 2, 3].map((n) => `/assets/stock/${base}-${n}.webp`)
    .filter((rel) => fs.existsSync(path.join(ROOT, rel)));
}

// church leads come from amenity=place_of_worship; map to tradition packs
const churchTradition = (rec) => /catholic/i.test(rec.denomination || '') ? 'catholic'
  : /lutheran|methodist|presbyterian|episcopal|anglican/i.test(rec.denomination || '') ? 'mainline'
  : 'contemporary';

export async function buildGreenfield(rec, { pages = false } = {}) {
  const name = rec.name;
  const slug = slugify(name);
  const isChurch = rec.vertical === 'church';
  const vertical = isChurch ? null : (PACKS[rec.vertical] ? rec.vertical : 'business');
  const pk = vertical ? PACKS[vertical] : null;

  let sections, heroHeadline, bookCta;
  if (vertical) {
    ({ sections } = buildSections(vertical, name, { slug }));
    heroHeadline = vary(slug, pk.heroes || [pk.hero])(name);
    bookCta = pk.bookCta;
  } else {
    heroHeadline = vary(slug, ['You’re welcome here.', 'Come as you are.', 'Find your place here.']);
    bookCta = 'Plan your visit →';
    sections = {
      services: { kicker: 'New here?', title: 'What your first visit looks like.',
        items: [{ h: 'Easy to find & park', p: 'Clear directions and a warm welcome at the door.' },
                { h: 'Come as you are', p: 'However long it’s been, you belong here.' },
                { h: 'About an hour', p: 'Music, a down-to-earth message, and you’re free.' }] },
      nextsteps: {}, care: {},
      cta: { title: 'We saved you a seat.', lead: 'Join us this week.' },
    };
  }

  // minimal signal object — there IS no site; everything comes from the record
  const sig = { title: name, description: '', color_signals: [], nav_tabs: [] };
  const stock = stockImages(isChurch ? 'church' : vertical, ROOT);
  const profile = normalize(sig, {
    slug, name,
    phone: rec.phone || '',
    location: rec.address || '',
    gallery: stock,
    heroImage: stock[vary(slug, [0, 1, 2]) % stock.length] || null,
    hero: { headline: heroHeadline,
      sub: rec.address ? `Proudly serving the neighborhood at ${rec.address}.` : 'Local, friendly, and ready to help.',
      ctas: [{ label: bookCta, href: vertical ? '#book' : '#visit' }] },
    sections,
  });

  const look = vary(slug, LOOKS);
  const recipe = { ...look, mood: 'drift', useCapturedPalette: false,
    ...(vertical ? { vertical } : { tradition: churchTradition(rec), archetype: 'journey' }) };

  const outDir = path.join(ROOT, 'demos', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const files = pages ? assembleSite(profile, recipe) : { 'index.html': assemble(profile, recipe) };
  for (const [file, html] of Object.entries(files)) fs.writeFileSync(path.join(outDir, file), await inlineAssets(html, outDir, ROOT));
  return { slug, name, files: Object.keys(files).length };
}

// ── run ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (k) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : null; };
if (!file) { console.error('usage: node engine/greenfield.mjs <discovered-*.json> [--only "Name"] [--pages]'); process.exit(1); }

const records = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const only = flag('only');
const targets = records.filter((r) => r.noSite && (!only || r.name.toLowerCase().includes(only.toLowerCase())));
if (!targets.length) { console.log('no no-site leads' + (only ? ` matching "${only}"` : '') + ' in ' + file); process.exit(0); }

console.log(`GREENFIELD: ${targets.length} no-site lead(s)`);
let failed = 0;
for (const rec of targets) {
  const r = await buildGreenfield(rec, { pages: args.includes('--pages') });
  const q = await qa(r.slug, { rendered: false });
  console.log(`  ${q.pass ? '✅' : '❌'} ${r.name}  →  demos/${r.slug}/  (${r.files} page${r.files > 1 ? 's' : ''})${rec.phone ? '  ☎ ' + rec.phone : ''}`);
  for (const f of q.fails) console.log('      ✗ ' + f);
  if (!q.pass) failed++;
}
console.log(`\n${targets.length - failed}/${targets.length} passed QA — openers: "I looked you up and you have no website — so I built you one. Two minutes to show you?"`);
process.exit(failed ? 1 : 0);
