// Sightline — Commercial (Business) Design System
// Four hand-crafted art directions, each a data-driven template.
// renderBusiness(profile, design) -> full self-contained HTML for ANY business.
//
// Mirrors the church design engine. Each design is a self-contained module
// under engine/business-designs/<design>.mjs exporting render(profile).
// Designs are STYLE; the profile is CONTENT (flexes to any vertical).

export const DESIGNS = {
  clinical: { label: "Clinical Calm", vibe: "Serene, premium-medical, jewel-tone", fit: ["dental", "medical", "obgyn", "dermatology", "ent", "orthodontic"] },
  editorial: { label: "Editorial Authority", vibe: "Prestige-firm restraint, established", fit: ["law", "finance", "wealth", "insurance", "title", "accounting", "cpa", "mortgage", "attorney"] },
  grounded: { label: "Grounded", vibe: "Sturdy, dependable, trades", fit: ["hvac", "plumbing", "landscaping", "roofing", "electrical", "contractor", "garage", "trades", "home", "heating", "construction"] },
  luxe: { label: "Luxe Mono", vibe: "Stark black/ivory + metallic, fashion-luxury", fit: ["cosmetic", "plastic", "surgery", "jewelry", "luxury", "aesthetics", "boutique"] },
  heritage: { label: "Heritage Craft", vibe: "Warm, textured, artisan/vintage-modern", fit: ["barber", "brewery", "coffee", "restaurant", "cafe", "tattoo", "craft", "bakery"] },
  precision: { label: "Tech Precision", vibe: "Crisp, geometric, structured, product-forward", fit: ["agency", "consulting", "it", "saas", "software", "b2b", "engineering", "architecture", "tech"] },
  playful: { label: "Playful Bright", vibe: "Friendly, multi-color, energetic", fit: ["pediatric", "childcare", "montessori", "daycare", "pet", "veterinary", "vet", "family-fun", "kids"] },
  warm: { label: "Warm Premium", vibe: "Boutique-hospitality, moody-luxe", fit: ["medspa", "wellness", "salon", "spa", "massage"] },
  bold: { label: "Bold Modern", vibe: "High-contrast, energetic, current", fit: ["fitness", "gym", "startup", "urban", "modern", "studio"] },
  light: { label: "Fresh Light", vibe: "Bright, airy, approachable-premium", fit: ["optometry", "family", "chiropractic", "dietitian", "clinic"] },
};

// Auto-match a design to a business from its vertical/tags.
export function recommendBusinessDesign(profile = {}) {
  const tags = [profile.vertical || "", profile.category || "", ...(profile.tags || [])].join(" ").toLowerCase();
  for (const [name, d] of Object.entries(DESIGNS)) {
    if (d.fit.some((f) => tags.includes(f))) return name;
  }
  return "clinical";
}

export async function renderBusiness(profile = {}, design = "clinical") {
  const d = DESIGNS[design] ? design : "clinical";
  const mod = await import(`./business-designs/${d}.mjs`);
  return mod.render(profile);
}

export default { DESIGNS, recommendBusinessDesign, renderBusiness };
