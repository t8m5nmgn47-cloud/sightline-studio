// ─────────────────────────────────────────────────────────────────────────────
// Variety layer for the SITE ENGINE — deterministic spread at the RECIPE level.
// Ported from engine/business-designs/variety.mjs (FNV-1a seed + salted pick),
// but applied to recipe decisions (archetype / structure / font pack / --rad)
// BEFORE rendering — never as HTML post-processing.
//
// Everything here is pure and deterministic: the same slug always gets the
// same variant (stable demos, stable screenshots), while same-vertical
// neighbours land on different combinations.
// ─────────────────────────────────────────────────────────────────────────────

// FNV-1a → stable 32-bit hash of the business identity. Accepts a profile
// object ({slug,name}) or a bare slug string.
export function seedOf(p = {}) {
  const s = typeof p === 'string' ? p : String(p.slug || p.name || 'sightline');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

// salted seeded index — different salts give independent axes off one seed
export const pick = (seed, salt, n) => ((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0) % n;

// ── structure spread ─────────────────────────────────────────────────────────
// Seeded choice among site-engine STRUCTURES keys (or any pool of them).
export function pickStructure(seed, availableStructures = []) {
  if (!availableStructures.length) return null;
  return availableStructures[pick(seed, 9, availableStructures.length)];
}

// ── font packs ───────────────────────────────────────────────────────────────
// Each site-engine THEME carries two mood-matched alternate Google display
// faces (adapted from business-designs/variety.mjs FONT packs — serif stays
// serif, friendly stays friendly). Entries match THEMES' {font, fontUrl}
// shape so assemble() can drop them straight into the css2 URL.
export const FONT_ALTS = {
  sanctuary: [ // elegant liturgical serif (default: Cormorant Garamond)
    { font: 'EB Garamond', fontUrl: 'EB+Garamond:wght@500;600;700' },
    { font: 'Marcellus',   fontUrl: 'Marcellus' },
  ],
  modern: [ // geometric contemporary sans (default: Sora)
    { font: 'Space Grotesk', fontUrl: 'Space+Grotesk:wght@500;600;700' },
    { font: 'Epilogue',      fontUrl: 'Epilogue:wght@500;600;700;800' },
  ],
  quiet: [ // calm bookish serif (default: Newsreader)
    { font: 'Lora',           fontUrl: 'Lora:wght@400;500;600' },
    { font: 'Source Serif 4', fontUrl: 'Source+Serif+4:opsz,wght@8..60,400..700' },
  ],
  community: [ // friendly rounded sans (default: Poppins)
    { font: 'Nunito',    fontUrl: 'Nunito:wght@500;600;700;800' },
    { font: 'Quicksand', fontUrl: 'Quicksand:wght@500;600;700' },
  ],
  heritage: [ // classic high-contrast display serif (default: Playfair Display)
    { font: 'Libre Caslon Text', fontUrl: 'Libre+Caslon+Text:wght@400;700' },
    { font: 'Fraunces',          fontUrl: 'Fraunces:opsz,wght@9..144,500..700' },
  ],
  evergreen: [ // warm dependable serif (default: Lora)
    { font: 'Bitter',   fontUrl: 'Bitter:wght@400;500;600;700' },
    { font: 'Spectral', fontUrl: 'Spectral:wght@400;500;600' },
  ],
  luxe: [ // fashion-house didone / high-contrast serif (default: Bodoni Moda)
    { font: 'Prata',     fontUrl: 'Prata' },
    { font: 'Cormorant', fontUrl: 'Cormorant:wght@500;600;700' },
  ],
};

// Returns null ~1/3 of the time (keep the theme's default face), otherwise one
// of the theme's two mood-matched alternates.
export function pickFontPack(seed, theme) {
  const alts = FONT_ALTS[theme];
  if (!alts || !alts.length) return null;
  const r = pick(seed, 21, alts.length + 1); // 0 = default, 1..n = alternates
  return r === 0 ? null : alts[r - 1];
}

// ── shape jitter ─────────────────────────────────────────────────────────────
// Small seeded --rad nudge off the theme's base radius, clamped >= 0.
const RAD_JITTER = [-4, 0, 6];
export function pickRad(seed, baseRad = 12) {
  return Math.max(0, (baseRad | 0) + RAD_JITTER[pick(seed, 31, RAD_JITTER.length)]);
}

// ── evidence-driven fallbacks (moved here from pipeline.mjs so the pipeline ──
// and the variety-check gate share ONE source of truth for selection logic).
export function fallbackArchetype(vertical, { galleryCount = 0, hasHero = false } = {}) {
  const visuals = galleryCount + (hasHero ? 1 : 0);
  if (['construction','trades','retail'].includes(vertical)) return visuals >= 5 ? 'flagship' : 'split';
  if (['law','accounting','mortgage','title','insurance'].includes(vertical)) return visuals >= 5 ? 'editorial' : 'minimal';
  if (['dental','medical','optometry','medspa','childcare'].includes(vertical)) return visuals >= 4 ? 'split' : 'editorial';
  return visuals >= 5 ? 'flagship' : 'editorial';
}

export function fallbackStructure({ reviews = 0, gallery = 0, hasOffer = false, hasStory = false } = {}) {
  if (reviews >= 3) return 'proof';
  if (gallery >= 6) return 'showcase';
  if (hasOffer) return 'offer';
  if (hasStory) return 'story';
  return 'flagship';
}

// ── design-spread pools (recommendBusinessDesign pattern: primary ×2 + alts ×1)
// Alternates stay on light-ground archetypes for captured palettes — never
// arch-modern's brand poster (the art critic flags color washes every time).
const ARCH_ALTS = {
  // statement (high-energy split-price offer look) rides as an alternate on the
  // high-energy primaries only — never behind the muted/professional leads.
  flagship:  ['split', 'editorial', 'statement'],
  split:     ['editorial', 'flagship', 'statement'],
  editorial: ['minimal', 'split'],
  minimal:   ['editorial', 'split'],
  cathedral: ['editorial', 'split'],
  modern:    ['flagship', 'split'],
  // church-side looks alternate between each other only — chooseArchetype is
  // the BUSINESS path, so these keys matter just when a church look is ever
  // handed in as a primary; hearth/journey must never lead a business pool.
  journey:   ['cathedral', 'hearth'],
  statement: ['flagship', 'split'],
  hearth:    ['journey', 'cathedral'],
};
const STRUCT_ALTS = {
  proof:    ['story', 'flagship'],
  story:    ['flagship', 'offer'],
  offer:    ['proof', 'flagship'],
  showcase: ['story', 'flagship'],
  flagship: ['story', 'offer'],
};

// ── the precedence rule, in one place ────────────────────────────────────────
//   flag (--archetype/--structure) > strategy's choice > seeded variety over a
//   pool built around the evidence fallback (primary ×2 + 2 alternates ×1).
// Strategy structure 'classic'/null = no opinion = variety decides.
export function chooseArchetype({ seed, flagged = null, strategy = null, vertical = 'business', evidence = {} } = {}) {
  if (flagged) return { value: flagged, source: 'flag' };
  if (strategy) return { value: strategy, source: 'strategy' };
  const primary = fallbackArchetype(vertical, evidence);
  const pool = [primary, primary, ...(ARCH_ALTS[primary] || ['editorial', 'split'])];
  return { value: pool[pick(seed, 5, pool.length)], source: `variety(pool:${primary})` };
}

export function chooseStructure({ seed, flagged = null, strategy = null, evidence = {} } = {}) {
  if (flagged) return { value: flagged, source: 'flag' };
  if (strategy && strategy !== 'classic') return { value: strategy, source: 'strategy' };
  const primary = fallbackStructure(evidence);
  const pool = [primary, primary, ...(STRUCT_ALTS[primary] || ['story', 'flagship'])];
  return { value: pickStructure(seed, pool), source: `variety(pool:${primary})` };
}

export default { seedOf, pick, pickStructure, pickFontPack, pickRad,
  fallbackArchetype, fallbackStructure, chooseArchetype, chooseStructure, FONT_ALTS };
