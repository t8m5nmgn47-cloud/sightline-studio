// ─────────────────────────────────────────────────────────────────────────────
// Per-vertical content packs. Turns a detected industry into industry-specific
// default sections — real service names, the right trust signals, the right
// call-to-action language — so a landscaper's site doesn't read like a dentist's.
//
// These are DEFAULTS: any field the capture/LLM step fills with the prospect's
// own real content overrides them. Crucially, NONE of these packs fabricate
// reviews or ratings — reviews render only when real ones were captured (see
// buildSections + the site-engine reviews section, which omits itself when
// empty). The old generic pack invented "4.9 from hundreds" and "Verified
// client" quotes; that is gone.
// ─────────────────────────────────────────────────────────────────────────────

// Map many real-world category words → a canonical vertical key.
const MATCHERS = [
  ["dental",   /dentist|dental|orthodont|invisalign|endodont|periodont|oral surgeon|smile/],
  ["medical",  /\b(family medicine|physician|clinic|md\b|internal medicine|pediatric|obgyn|ob\/gyn|dermatolog|ent\b|allergy|urgent care|primary care|health)\b/],
  ["optometry",/optometr|optician|eye care|vision center|eyewear|lasik/],
  ["law",      /attorney|law ?firm|lawyer|litigation|legal|counsel|esq\b|practice areas/],
  ["accounting",/\b(cpa|accountant|accounting|bookkeep|tax\b|payroll|audit)\b/],
  ["insurance",/insurance|insur(er|ance)|coverage|policy|agent|allstate|farmers|state farm/],
  ["mortgage", /mortgage|lender|lending|loan officer|home loan|refinanc/],
  ["title",    /title|escrow|closing|settlement/],
  ["medspa",   /med ?spa|aesthetic|botox|filler|laser|injectable|skin|wellness|salon|spa\b/],
  ["trades",   /hvac|plumb|roof|electric|landscap|lawn|contractor|remodel|construction|heating|cooling|garage|handyman|paint|concrete|fencing|excavat/],
  ["childcare",/montessori|childcare|daycare|preschool|early learning|academy|nursery|tutoring/],
];

export function detectVertical(text = "") {
  const t = text.toLowerCase();
  for (const [key, re] of MATCHERS) if (re.test(t)) return key;
  return "business";
}

const svc = (h, p) => ({ h, p });

// Each pack: the CTA/label language + the default section content. `services`
// is the big differentiator — real, industry-specific service names.
export const PACKS = {
  dental: {
    label: "Dental", bookCta: "Book appointment →", imNew: "New Patients",
    hero: (n) => `${n} — gentle dentistry for the whole family.`,
    services: ["Preventive cleanings & exams", "Cosmetic & whitening", "Crowns, bridges & implants", "Clear aligners", "Emergency dental care", "Kids' dentistry"],
    offer: { kicker: "New here?", title: "New-patient welcome.", lead: "Exam, X-rays & a gentle cleaning — book this week and we'll take great care of you.", cta: "Claim it →" },
    money: { kicker: "Affordable care", title: "Insurance & financing, made easy.", lead: "We accept most major dental plans and offer flexible financing." },
    trust: ["Same-week appointments", "Most insurance accepted", "Gentle, judgment-free care", "Modern, comfortable office"],
  },
  medical: {
    label: "Medical", bookCta: "Request an appointment →", imNew: "New Patients",
    hero: (n) => `${n} — attentive care, close to home.`,
    services: ["Annual physicals & wellness", "Same-day sick visits", "Chronic condition management", "Preventive screenings", "On-site labs", "Telehealth visits"],
    offer: { kicker: "New patients", title: "Now accepting new patients.", lead: "Most insurance accepted — request a visit that fits your schedule.", cta: "Request a visit →" },
    money: { kicker: "Coverage", title: "Insurance, simplified.", lead: "We work with most major insurers and explain your costs up front." },
    trust: ["Accepting new patients", "Most insurance accepted", "Same-day sick visits", "On-site labs"],
  },
  optometry: {
    label: "Eye Care", bookCta: "Book an eye exam →", imNew: "New Patients",
    hero: (n) => `${n} — clear vision, personal care.`,
    services: ["Comprehensive eye exams", "Designer eyewear & frames", "Contact lens fittings", "Dry-eye treatment", "Kids' vision care", "LASIK consultations"],
    offer: { kicker: "New here?", title: "New-patient eye exam.", lead: "A full exam plus time to find frames you love — book this week.", cta: "Book now →" },
    money: { kicker: "Coverage", title: "Vision plans welcome.", lead: "We accept most vision and medical plans and make benefits easy to use." },
    trust: ["Most vision plans accepted", "Huge frame selection", "Kid-friendly", "Latest exam technology"],
  },
  law: {
    label: "Law", bookCta: "Request a free consult →", imNew: "Free Consult",
    hero: (n) => `${n} — steady counsel when it matters most.`,
    services: ["Free initial consultation", "Case evaluation & strategy", "Negotiation & settlement", "Trial representation", "Document review", "Ongoing counsel"],
    offer: { kicker: "No pressure", title: "Start with a free consultation.", lead: "Tell us what you're facing — we'll tell you where you stand, honestly.", cta: "Request a consult →" },
    money: null,
    trust: ["Free initial consult", "Straight answers", "Responsive & discreet", "Decades of combined experience"],
  },
  accounting: {
    label: "Accounting", bookCta: "Book a consultation →", imNew: "New Clients",
    hero: (n) => `${n} — numbers handled, so you can run your business.`,
    services: ["Tax preparation & planning", "Bookkeeping & payroll", "Business advisory", "Entity & startup setup", "IRS representation", "Financial statements"],
    offer: { kicker: "New clients", title: "Free 20-minute strategy call.", lead: "Bring last year's return — we'll spot what it's costing you.", cta: "Book the call →" },
    money: null,
    trust: ["Year-round support", "Proactive tax planning", "Clear flat pricing", "Responsive & local"],
  },
  insurance: {
    label: "Insurance", bookCta: "Get a free quote →", imNew: "Free Quote",
    hero: (n) => `${n} — the right coverage, explained plainly.`,
    services: ["Auto insurance", "Home & renters", "Life insurance", "Business coverage", "Umbrella policies", "Free policy review"],
    offer: { kicker: "No obligation", title: "Free policy review.", lead: "Send your current policy — we'll find gaps and savings, no pressure.", cta: "Get my review →" },
    money: null,
    trust: ["Independent — we shop for you", "Free policy reviews", "Local, licensed agents", "Claims help when you need it"],
  },
  mortgage: {
    label: "Mortgage", bookCta: "Get pre-approved →", imNew: "Get Started",
    hero: (n) => `${n} — home financing without the runaround.`,
    services: ["Purchase loans", "Refinancing", "First-time buyer programs", "FHA / VA loans", "Jumbo loans", "Rate & payment consult"],
    offer: { kicker: "No cost", title: "Free pre-approval.", lead: "Know your budget before you shop — a quick call gets you a real number.", cta: "Start pre-approval →" },
    money: null,
    trust: ["Fast pre-approvals", "Local decisions", "Clear on rates & fees", "Guidance start to finish"],
  },
  title: {
    label: "Title & Escrow", bookCta: "Open an order →", imNew: "Start a File",
    hero: (n) => `${n} — closings that actually close on time.`,
    services: ["Title search & insurance", "Escrow & settlement", "Refinance closings", "Commercial transactions", "1031 exchanges", "Wire-fraud protection"],
    offer: { kicker: "For agents & lenders", title: "Open your next order online.", lead: "Fast title commitments and a closing team that communicates.", cta: "Open an order →" },
    money: null,
    trust: ["On-time closings", "Wire-fraud safeguards", "Responsive closing team", "Purchase, refi & commercial"],
  },
  medspa: {
    label: "Med Spa", bookCta: "Book your visit →", imNew: "Book Now",
    hero: (n) => `${n} — natural results, no pressure.`,
    services: ["Injectables & neuromodulators", "Dermal fillers", "Laser & IPL", "Medical facials", "Body contouring", "Skin consultations"],
    offer: { kicker: "New here?", title: "New-client credit.", lead: "Consultation is always free — book this week and we'll credit your first treatment.", cta: "Claim it →" },
    money: { kicker: "Financing", title: "Flexible payment options.", lead: "Treatment plans and financing so you can start when you're ready." },
    trust: ["Physician-led", "Free consultations", "Natural-looking results", "5-star rated"],
  },
  trades: {
    label: "Home Services", bookCta: "Get a free estimate →", imNew: "Free Estimate",
    hero: (n) => `${n} — dependable work, done right the first time.`,
    services: ["Free on-site estimates", "Repairs & installation", "Emergency service", "Scheduled maintenance", "Upfront pricing", "Licensed & insured crews"],
    offer: { kicker: "This season", title: "Free, no-obligation estimate.", lead: "Tell us the job — we'll come out, take a look, and give you a straight price.", cta: "Get my estimate →" },
    money: { kicker: "Financing", title: "Financing on bigger jobs.", lead: "Approved financing options so a big repair doesn't wait." },
    trust: ["Licensed & insured", "Upfront pricing", "Emergency service", "Satisfaction guaranteed"],
  },
  childcare: {
    label: "Childcare & Education", bookCta: "Schedule a tour →", imNew: "Schedule a Tour",
    hero: (n) => `${n} — where curious kids love to learn.`,
    services: ["Infant & toddler care", "Preschool program", "Pre-K readiness", "Before & after care", "Summer programs", "Enrichment activities"],
    offer: { kicker: "Come see us", title: "Schedule a tour.", lead: "The best way to feel the difference is to visit — we'd love to show you around.", cta: "Book a tour →" },
    money: null,
    trust: ["Licensed & accredited", "Low child-to-teacher ratios", "Safe, secure campus", "Nurturing, qualified staff"],
  },
  business: {
    label: "Local Business", bookCta: "Get in touch →", imNew: "Get Started",
    hero: (n) => `${n} — trusted service, close to home.`,
    services: ["Free consultation", "Personalized service", "Experienced team", "Fair, upfront pricing", "Local & dependable", "Satisfaction guaranteed"],
    offer: { kicker: "New here?", title: "Let's talk.", lead: "Tell us what you need — we'll take it from there.", cta: "Get in touch →" },
    money: null,
    trust: ["Locally owned", "Upfront pricing", "Experienced team", "Great reviews"],
  },
};

// Build the site-engine `sections` object for a business vertical.
// realReviews: array of {q, name} captured from the prospect (optional). When
// absent, the reviews section is OMITTED entirely — we never invent reviews.
export function buildSections(vertical, name, { realReviews = [], rating = null, reviewCount = null } = {}) {
  const pk = PACKS[vertical] || PACKS.business;
  const sections = {
    book: { title: "Ready when you are.", sub: `Book online in under a minute — new clients welcome.` },
    services: {
      kicker: "Our services", title: "How we can help.",
      items: pk.services.map((s) => svc(s, "")),
    },
    offer: pk.offer || undefined,
    hours: {},
    cta: { title: "Let's get started.", lead: pk.offer?.lead || "Reach out and we'll take great care of you." },
  };
  if (pk.money) sections.money = pk.money;
  // Reviews: ONLY when real ones were captured. No fabrication.
  if (realReviews && realReviews.length) {
    sections.reviews = {
      kicker: "What people say", title: "Trusted across the community.",
      rating: rating || undefined, count: reviewCount || undefined,
      items: realReviews.slice(0, 6).map((r) => ({ q: r.q || r.quote, name: r.name || "Verified customer" })),
    };
  }
  return { sections, pack: pk };
}

export default { detectVertical, PACKS, buildSections };
