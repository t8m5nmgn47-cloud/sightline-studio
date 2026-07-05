// Sightline — Commercial (Business) Design System
// Ten hand-crafted art directions, each a data-driven template.
// renderBusiness(profile, design) -> full self-contained HTML for ANY business.
//
// Mirrors the church design engine. Each design is a self-contained module
// under engine/business-designs/<design>.mjs exporting render(profile).
// Designs are STYLE; the profile is CONTENT (flexes to any vertical).
//
// Variety: every render passes through the variety layer (variety.mjs) —
// seeded narrative order, font pack, and shape — so two businesses in the
// same vertical never come out looking like the same page. Each design also
// declares `alts`: neighbouring designs that suit the same verticals, and
// recommendBusinessDesign() spreads same-vertical businesses across them.

import { applyVariety, seedOf } from "./business-designs/variety.mjs";

export const DESIGNS = {
  clinical: { label: "Clinical Calm", vibe: "Serene, premium-medical, jewel-tone", fit: ["dental", "medical", "obgyn", "dermatology", "ent", "orthodontic"], alts: ["light", "warm"] },
  editorial: { label: "Editorial Authority", vibe: "Prestige-firm restraint, established", fit: ["law", "finance", "wealth", "insurance", "title", "accounting", "cpa", "mortgage", "attorney"], alts: ["precision", "luxe"] },
  grounded: { label: "Grounded", vibe: "Sturdy, dependable, trades", fit: ["hvac", "plumbing", "landscaping", "roofing", "electrical", "contractor", "garage", "trades", "home", "heating", "construction"], alts: ["bold", "heritage"] },
  luxe: { label: "Luxe Mono", vibe: "Stark black/ivory + metallic, fashion-luxury", fit: ["cosmetic", "plastic", "surgery", "jewelry", "luxury", "aesthetics", "boutique"], alts: ["editorial", "warm"] },
  heritage: { label: "Heritage Craft", vibe: "Warm, textured, artisan/vintage-modern", fit: ["barber", "brewery", "coffee", "restaurant", "cafe", "tattoo", "craft", "bakery"], alts: ["grounded", "warm"] },
  precision: { label: "Tech Precision", vibe: "Crisp, geometric, structured, product-forward", fit: ["agency", "consulting", "it", "saas", "software", "b2b", "engineering", "architecture", "tech"], alts: ["bold", "editorial"] },
  playful: { label: "Playful Bright", vibe: "Friendly, multi-color, energetic", fit: ["pediatric", "childcare", "montessori", "daycare", "pet", "veterinary", "vet", "family-fun", "kids"], alts: ["light", "bold"] },
  warm: { label: "Warm Premium", vibe: "Boutique-hospitality, moody-luxe", fit: ["medspa", "wellness", "salon", "spa", "massage"], alts: ["luxe", "heritage"] },
  bold: { label: "Bold Modern", vibe: "High-contrast, energetic, current", fit: ["fitness", "gym", "startup", "urban", "modern", "studio"], alts: ["precision", "playful"] },
  light: { label: "Fresh Light", vibe: "Bright, airy, approachable-premium", fit: ["optometry", "family", "chiropractic", "dietitian", "clinic"], alts: ["clinical", "playful"] },
};

// Auto-match a design to a business from its vertical/tags.
// By default the pick is SPREAD deterministically across the primary fit and
// its `alts` (weighted toward the primary), so eight dentists in the same
// town don't all receive the same art direction. Pass { spread:false } for
// the old first-match behaviour.
export function recommendBusinessDesign(profile = {}, { spread = true } = {}) {
  const tags = [profile.vertical || "", profile.category || "", ...(profile.tags || [])].join(" ").toLowerCase();
  let primary = null;
  for (const [name, d] of Object.entries(DESIGNS)) {
    if (d.fit.some((f) => tags.includes(f))) { primary = name; break; }
  }
  primary = primary || "clinical";
  if (!spread) return primary;
  // pool: primary ×2 (favoured) + its stylistic neighbours ×1 each
  const pool = [primary, primary, ...(DESIGNS[primary].alts || [])];
  return pool[seedOf(profile) % pool.length];
}

export async function renderBusiness(profile = {}, design = "clinical", { variety = true } = {}) {
  const d = DESIGNS[design] ? design : "clinical";
  const mod = await import(`./business-designs/${d}.mjs`);
  let html = mod.render(profile);
  if (variety && profile.variety !== false) html = applyVariety(html, profile, d);
  return html;
}

export default { DESIGNS, recommendBusinessDesign, renderBusiness };
