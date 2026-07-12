// ─────────────────────────────────────────────────────────────────────────────
// VARIETY CHECK — the distinctness gate. Same-vertical neighbours must not
// collapse onto one look. Builds fixture profiles IN-MEMORY through the exact
// selection logic production uses (recommendRecipe + variety.mjs choose*, the
// same imports pipeline.mjs runs — no shelling out), fingerprints each on
// {archetype, structure, theme+fontpack, rad}, and FAILS if:
//   · any two fixtures in a set share ALL FOUR axes, or
//   · < 2 archetypes are used across a set of 6, or
//   · < 3 structures are used across the dental set of 6
//     (churches have no structure axis — the church-copy variant signature
//      from site-engine stands in for it, and must span ≥ 3 variants).
// Also asserts the captured-brand-font rule: fonts.head present → no variety
// font pack is ever applied.
//
//   node engine/variety-check.mjs        # exit 0 = pass, exit 1 = collapse
// ─────────────────────────────────────────────────────────────────────────────
import { recommendRecipe, applyRecipeVariety, churchCopySignature } from './site-engine.mjs';
import { seedOf, chooseArchetype, chooseStructure } from './variety.mjs';

let failed = false;
const fail = (msg) => { failed = true; console.error('  ✗ ' + msg); };

// ── fixtures: 6 same-vertical dental prospects (identical brand hue + identical
// content evidence — the worst case: only the seed can tell them apart) ───────
const DENTAL = [
  'summit-family-dental', 'riverbend-dental-care', 'harbor-point-dental',
  'oak-grove-dental', 'maple-dental-studio', 'canyon-ridge-dental',
].map(slug => ({
  slug, name: slug.replace(/-/g, ' '),
  palette: { brand: '#1f6f5c' },          // same hue bucket for all six
  fonts: null, heroImage: '/x.webp', gallery: ['/a.webp', '/b.webp'],
}));

const CHURCHES = [
  'grace-community-church', 'first-baptist-church', 'hillside-chapel',
  'new-hope-fellowship', 'st-marks-lutheran', 'crossroads-church',
].map(slug => ({
  slug, name: slug.replace(/-/g, ' '),
  palette: { brand: '#6b2737' },          // same hue bucket for all six
  fonts: null, heroImage: '/x.webp', gallery: [],
}));

// the pipeline's biz selection, replicated via the SAME shared functions
function bizFingerprint(profile) {
  const recipe = recommendRecipe(profile);
  const seed = seedOf(profile);
  recipe.vertical = 'dental';
  recipe.archetype = chooseArchetype({
    seed, vertical: 'dental',
    evidence: { galleryCount: profile.gallery.length, hasHero: !!profile.heroImage },
  }).value;
  recipe.structure = chooseStructure({
    seed,
    evidence: { reviews: 0, gallery: profile.gallery.length, hasOffer: false, hasStory: false },
  }).value;
  applyRecipeVariety(recipe, profile);
  return {
    archetype: recipe.archetype,
    structure: recipe.structure,
    typeface: `${recipe.theme}/${recipe.fontPack ? recipe.fontPack.font : 'default'}`,
    rad: recipe.rad,
  };
}

function churchFingerprint(profile) {
  const recipe = recommendRecipe(profile);   // church path keeps recommend's archetype
  recipe.tradition = 'contemporary';
  applyRecipeVariety(recipe, profile);
  return {
    archetype: recipe.archetype,
    structure: churchCopySignature(profile),  // copy-variant signature stands in
    typeface: `${recipe.theme}/${recipe.fontPack ? recipe.fontPack.font : 'default'}`,
    rad: recipe.rad,
  };
}

function checkSet(label, profiles, fingerprint, minStructures) {
  console.log(`\n${label}`);
  const fps = profiles.map(p => ({ slug: p.slug, ...fingerprint(p) }));
  for (const f of fps)
    console.log(`  ${f.slug.padEnd(26)} ${f.archetype.padEnd(10)} ${String(f.structure).slice(0, 34).padEnd(36)} ${f.typeface.padEnd(28)} rad=${f.rad}`);
  const key = f => `${f.archetype}|${f.structure}|${f.typeface}|${f.rad}`;
  let collided = false;
  for (let i = 0; i < fps.length; i++)
    for (let j = i + 1; j < fps.length; j++)
      if (key(fps[i]) === key(fps[j])) {
        collided = true;
        fail(`${fps[i].slug} and ${fps[j].slug} share ALL FOUR axes (${key(fps[i])})`);
      }
  const archs = new Set(fps.map(f => f.archetype));
  const structs = new Set(fps.map(f => f.structure));
  if (archs.size < 2) fail(`only ${archs.size} archetype(s) across ${label} — need ≥ 2`);
  if (structs.size < minStructures) fail(`only ${structs.size} structure/variant value(s) across ${label} — need ≥ ${minStructures}`);
  if (!collided && archs.size >= 2 && structs.size >= minStructures)
    console.log(`  ✓ ${archs.size} archetypes, ${structs.size} structure/variant values, no full-fingerprint collision`);
}

checkSet('DENTAL ×6 (same hue, same evidence)', DENTAL, bizFingerprint, 3);
checkSet('CHURCH ×6 (same hue)', CHURCHES, churchFingerprint, 3);

// ── captured brand font must always beat the variety layer ──────────────────
const branded = { slug: 'summit-family-dental', name: 'summit family dental',
  palette: { brand: '#1f6f5c' }, fonts: { head: 'Montserrat:400,700' }, heroImage: '/x.webp', gallery: [] };
const br = recommendRecipe(branded);
if (br.fontPack !== null) fail(`profile with fonts.head got a variety font pack (${br.fontPack?.font}) — captured font must win`);
else console.log('\n  ✓ captured brand font wins: fonts.head present → fontPack null');

if (failed) { console.error('\n❌ VARIETY CHECK FAILED — recipes collapsed; fix the spread, do not bypass the gate.'); process.exit(1); }
console.log('\n✅ variety check passed — same-vertical fixtures stay distinct.');
