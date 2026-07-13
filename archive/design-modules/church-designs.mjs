// Sightline — Church Design System
// Six hand-crafted art directions, each a data-driven template.
// renderChurch(profile, design) -> full self-contained HTML for ANY church.
//
// Each design is a self-contained module under engine/church-designs/<design>.mjs
// exporting render(profile). Every module swaps a church's own identity + content
// (name, verse, service times, campuses, events, giving campaign, testimony, hero
// photo) into its art direction. Universal church copy (first-visit steps, "belong"
// cards, ministries by age) stays as tasteful, overridable defaults.

export const DESIGNS = {
  flagship: { label: "Living Light", vibe: "Cinematic, warm, contemporary non-denom", fit: ["contemporary", "nondenom", "multisite"] },
  reverent: { label: "Reverent", vibe: "Ivory + aubergine, sacred, symmetric", fit: ["catholic", "liturgical", "traditional"] },
  classic: { label: "Chapel Classic", vibe: "Navy + gold crest, established, heritage", fit: ["mainline", "presbyterian", "methodist", "baptist"] },
  hearth: { label: "Hearth", vibe: "Terracotta + forest, warm, family, rounded", fit: ["community", "family", "suburban"] },
  stillness: { label: "Stillness", vibe: "Sage + stone, calm, contemplative", fit: ["contemplative", "recovery", "quiet"] },
  kinetic: { label: "Kinetic", vibe: "Acid-lime on ink, bold, young", fit: ["youth", "college", "urban", "plant"] },
};

// Auto-match a design to a church from its tradition/vibe tags.
export function recommendDesign(profile = {}) {
  const t = (profile.tradition || profile.vibe || "").toLowerCase();
  const tags = [t, ...(profile.tags || [])].join(" ");
  for (const [name, d] of Object.entries(DESIGNS)) {
    if (name === "flagship") continue;
    if (d.fit.some((f) => tags.includes(f))) return name;
  }
  return "flagship";
}

export async function renderChurch(profile = {}, design = "flagship") {
  const d = DESIGNS[design] ? design : "flagship";
  const mod = await import(`./church-designs/${d}.mjs`);
  return mod.render(profile);
}

export default { DESIGNS, recommendDesign, renderChurch };
