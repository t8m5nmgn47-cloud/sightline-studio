// ─────────────────────────────────────────────────────────────────────────────
// Variety layer — makes every generated site deterministically DIFFERENT,
// even for two businesses in the same vertical rendered through the same
// art direction. Three axes, all seeded from the business identity:
//
//   1. NARRATIVE ORDER  — the middle sections (services/offer/why/reviews/team)
//      are re-sequenced into one of five curated storytelling orders.
//   2. FONT PACK        — each design carries two alternate type pairings in
//      the same mood as its default; a third of businesses get each.
//   3. SHAPE            — corner-radius token override where the template
//      supports the --rad custom property.
//
// Pure string transforms on the rendered HTML, applied in renderBusiness()
// after the design module renders. Deterministic: the same business always
// gets the same variant (stable demos, stable screenshots).
// Opt out per call with { variety:false } or pin choices via p.variant,
// e.g. p.variant = { order:"proof-first", fontPack:1, shape:0 }.
// ─────────────────────────────────────────────────────────────────────────────

// FNV-1a → stable 32-bit hash of the business identity.
export function seedOf(p = {}) {
  const s = String(p.slug || p.name || "sightline");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
const pick = (seed, salt, n) => ((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0) % n;

// ── 1. Narrative orders (middle sections; hero+trust stay first, book/visit last)
export const ORDERS = {
  classic:        ["services", "offer", "why", "reviews", "team"],
  "proof-first":  ["reviews", "services", "why", "offer", "team"],
  "people-first": ["team", "why", "services", "reviews", "offer"],
  "value-first":  ["offer", "services", "reviews", "why", "team"],
  "story-first":  ["why", "services", "reviews", "team", "offer"],
};
const ORDER_KEYS = Object.keys(ORDERS);

export function reorderSections(html, orderKey) {
  const want = ORDERS[orderKey];
  if (!want) return html;
  const blocks = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)];
  if (blocks.length < 5) return html; // not a standard page
  const byId = {};
  for (const m of blocks) {
    const id = (m[0].match(/\bid="([^"]+)"/) || [])[1];
    if (id) byId[id] = m[0];
  }
  const present = want.filter((id) => byId[id]);
  if (present.length < 3) return html; // ids missing → leave untouched
  // Replace each block with a placeholder, then fill placeholders in document
  // order with the blocks in the requested narrative order.
  let out = html;
  present.forEach((id, i) => { out = out.replace(byId[id], `<!--SLOT${i}-->`); });
  const docSlots = [...out.matchAll(/<!--SLOT(\d+)-->/g)].map((m) => m[0]);
  docSlots.forEach((slot, i) => { out = out.replace(slot, byId[present[i]]); });
  return out;
}

// ── 2. Font packs — index 0 keeps the design's built-in pairing.
// Each alternate stays inside the design's mood (serif stays serif, mono mono).
const F = (name, spec) => ({ name, spec });
export const FONT_PACKS = {
  clinical: { head: F("Newsreader", ""), body: F("Instrument Sans", ""), alts: [
    { head: F("Lora", "Lora:ital,wght@0,400..700;1,400..600"), body: F("Albert Sans", "Albert+Sans:wght@400;500;600;700") },
    { head: F("Source Serif 4", "Source+Serif+4:opsz,wght@8..60,300..700"), body: F("Public Sans", "Public+Sans:wght@400;500;600;700") },
  ]},
  editorial: { head: F("Fraunces", ""), body: F("Archivo", ""), alts: [
    { head: F("Libre Caslon Text", "Libre+Caslon+Text:ital,wght@0,400;0,700;1,400"), body: F("Manrope", "Manrope:wght@400;500;600;700") },
    { head: F("Newsreader", "Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..600"), body: F("Inter", "Inter:wght@400;500;600;700") },
  ]},
  grounded: { head: F("Zilla Slab", ""), body: F("IBM Plex Sans", ""), alts: [
    { head: F("Bitter", "Bitter:ital,wght@0,400..800;1,400..700"), body: F("Work Sans", "Work+Sans:wght@400;500;600;700") },
    { head: F("Rokkitt", "Rokkitt:wght@400..800"), body: F("Barlow", "Barlow:wght@400;500;600;700") },
  ]},
  luxe: { head: F("Bodoni Moda", ""), body: F("Jost", ""), alts: [
    { head: F("Cormorant", "Cormorant:ital,wght@0,400..700;1,400..600"), body: F("Outfit", "Outfit:wght@300;400;500;600") },
    { head: F("Italiana", "Italiana"), body: F("Montserrat", "Montserrat:wght@300;400;500;600") },
  ]},
  heritage: { head: F("Bevan", ""), body: F("Spectral", ""), alts: [
    { head: F("Ultra", "Ultra"), body: F("Lora", "Lora:ital,wght@0,400..600;1,400") },
    { head: F("Alfa Slab One", "Alfa+Slab+One"), body: F("PT Serif", "PT+Serif:ital,wght@0,400;0,700;1,400") },
  ]},
  precision: { head: F("Archivo", ""), body: F("IBM Plex Mono", ""), alts: [
    { head: F("Space Grotesk", "Space+Grotesk:wght@400..700"), body: F("Space Mono", "Space+Mono:wght@400;700") },
    { head: F("Sora", "Sora:wght@400..800"), body: F("JetBrains Mono", "JetBrains+Mono:wght@400;500;600") },
  ]},
  playful: { head: F("Quicksand", ""), body: F("Fraunces", ""), alts: [
    { head: F("Baloo 2", "Baloo+2:wght@500..800"), body: F("Lora", "Lora:ital,wght@0,400..600;1,400") },
    { head: F("Nunito", "Nunito:wght@500..800"), body: F("Fraunces", "Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400") },
  ]},
  warm: { head: F("Fraunces", ""), body: F("Hanken Grotesk", ""), alts: [
    { head: F("Cormorant Garamond", "Cormorant+Garamond:ital,wght@0,400..700;1,400..600"), body: F("Inter", "Inter:wght@400;500;600;700") },
    { head: F("Marcellus", "Marcellus"), body: F("Karla", "Karla:ital,wght@0,400..700;1,400") },
  ]},
  bold: { head: F("Bricolage Grotesque", ""), body: F("Archivo", ""), alts: [
    { head: F("Anton", "Anton"), body: F("Inter", "Inter:wght@400;500;600;700") },
    { head: F("Archivo Black", "Archivo+Black"), body: F("Archivo", "Archivo:wght@400;500;600;700") },
  ]},
  light: { head: F("Bricolage Grotesque", ""), body: F("Hanken Grotesk", ""), alts: [
    { head: F("Sora", "Sora:wght@400..800"), body: F("Inter", "Inter:wght@400;500;600;700") },
    { head: F("Epilogue", "Epilogue:wght@400..800"), body: F("Mulish", "Mulish:wght@400..700") },
  ]},
};

export function applyFontPack(html, design, packIndex) {
  const packs = FONT_PACKS[design];
  if (!packs || packIndex === 0) return html;
  const alt = packs.alts[packIndex - 1];
  if (!alt) return html;
  const href = `https://fonts.googleapis.com/css2?family=${alt.head.spec}&family=${alt.body.spec}&display=swap`;
  // collapse every css2 stylesheet link into one link loading the new pairing
  let replaced = false;
  html = html.replace(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g, () => {
    if (replaced) return "";
    replaced = true;
    return `<link href="${href}" rel="stylesheet">`;
  });
  // swap family names in CSS/inline styles — longest first for safety
  const swaps = [[packs.head.name, alt.head.name], [packs.body.name, alt.body.name]]
    .sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of swaps) if (from !== to) html = html.split(from).join(to);
  return html;
}

// ── 3. Shape token (only where the template already uses --rad)
const RADII = [null, "4px", "12px", "24px"];
export function applyShape(html, radIndex) {
  const rad = RADII[radIndex];
  if (!rad || !html.includes("--rad")) return html;
  return html.replace("</head>", `<style id="sl-variety">:root{--rad:${rad}}</style>\n</head>`);
}

// ── main entry ───────────────────────────────────────────────────────────────
export function applyVariety(html, profile = {}, design = "clinical") {
  const v = profile.variant || {};
  const seed = v.seed != null ? v.seed : seedOf(profile);
  const orderKey = v.order || ORDER_KEYS[pick(seed, 1, ORDER_KEYS.length)];
  const packIndex = v.fontPack != null ? v.fontPack : pick(seed, 2, 3);
  const radIndex = v.shape != null ? v.shape : pick(seed, 3, RADII.length);
  let out = html;
  out = reorderSections(out, orderKey);
  out = applyFontPack(out, design, packIndex);
  out = applyShape(out, radIndex);
  return out;
}

export default { applyVariety, seedOf, ORDERS, FONT_PACKS };
