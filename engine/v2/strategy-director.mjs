// Sightline Engine V2 — strategy director
// Turns a business profile into a page strategy before visual rendering.

const HOME_SERVICE = ["electric", "hvac", "plumb", "roof", "landscap", "contractor", "garage", "home service"];
const PROFESSIONAL = ["law", "attorney", "finance", "wealth", "title", "account", "consult"];
const HEALTH = ["dental", "medical", "clinic", "ortho", "derm", "health"];

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function directStrategy(profile = {}) {
  const signal = [profile.vertical, profile.category, ...(profile.tags || [])].filter(Boolean).join(" ").toLowerCase();

  if (hasAny(signal, HOME_SERVICE)) {
    return {
      grammar: "field-notes",
      hero: "diagnostic-split",
      proofMode: "operational",
      serviceMode: "problem-first",
      projectMode: "field-notes",
      sectionOrder: ["hero", "proof", "problems", "fieldNotes", "process", "faq", "cta"],
      tone: "capable, precise, calm under pressure",
      motion: "restrained",
    };
  }

  if (hasAny(signal, PROFESSIONAL)) {
    return {
      grammar: "editorial-authority",
      hero: "thesis-led",
      proofMode: "case-evidence",
      serviceMode: "matter-types",
      projectMode: "case-notes",
      sectionOrder: ["hero", "thesis", "proof", "matters", "caseNotes", "process", "cta"],
      tone: "measured, exact, quietly confident",
      motion: "minimal",
    };
  }

  if (hasAny(signal, HEALTH)) {
    return {
      grammar: "trust-journey",
      hero: "reassurance-first",
      proofMode: "patient-confidence",
      serviceMode: "care-paths",
      projectMode: "outcomes",
      sectionOrder: ["hero", "proof", "carePaths", "team", "visitJourney", "faq", "cta"],
      tone: "warm, clear, reassuring",
      motion: "soft",
    };
  }

  return {
    grammar: "editorial-story",
    hero: "positioning-led",
    proofMode: "business-specific",
    serviceMode: "editorial-index",
    projectMode: "selected-work",
    sectionOrder: ["hero", "positioning", "proof", "services", "work", "process", "cta"],
    tone: "clear, specific, confident",
    motion: "restrained",
  };
}

export default { directStrategy };
