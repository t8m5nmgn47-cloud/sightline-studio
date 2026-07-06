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
// Detection is SCORED, not first-match-wins: every matcher counts its hits
// across the text, and the vertical needs a minimum weight to claim the site.
// This stops one stray word (a reloading shop's "powder filler" reading as a
// med-spa "filler") from dressing a business in the wrong industry.
const MATCHERS = [
  // Strong medical signals FIRST — OB/GYN, dermatology, etc. offer some aesthetic
  // services but are medical practices, not med spas.
  ["medical",  /obgyn|ob\/gyn|gynecolog|midwif|women'?s health|dermatolog|family medicine|physician|internal medicine|pediatric|primary care|urgent care|\bent\b|otolaryngolog|allergy/g],
  // Dentistry requires dental CONTEXT so "dental insurance" on an insurance site
  // doesn't misfire to dental.
  ["dental",   /dentist|dentistry|dental (?:care|office|practice|group|associates|implants|clinic|arts|studio)|orthodont|invisalign|endodont|periodont|oral surgeon/g],
  ["optometry",/optometr|optician|eye ?care|eye ?exam|vision center|eyewear|lasik|ophthalmolog/g],
  // Med-spa terms must be unambiguous: "dermal filler", not any "filler"
  // ("powder filler", "crack filler", "filler words" are not injectables).
  ["medspa",   /med ?spa|medical spa|aesthetic|botox|dysport|dermal filler|lip filler|filler treatment|injectable|coolsculpt|microneedl|hydrafacial/g],
  ["title",    /escrow|title (?:company|insurance|agency|&|and escrow)|title ?& ?escrow|settlement services/g],
  ["mortgage", /mortgage|loan officer|home loan|refinanc|pre-?approv|nmls/g],
  ["accounting",/\b(cpa|accountant|accounting|bookkeep|payroll)\b|tax (?:prep|planning|return|service)/g],
  ["insurance",/insurance agenc|independent (?:insurance )?agen|\binsurance\b|coverage options|allstate|farmers insurance|state farm/g],
  ["law",      /attorney|law ?firm|lawyer|litigation|\blegal\b|\bcounsel\b|practice areas|\besq\b/g],
  ["childcare",/montessori|childcare|daycare|preschool|early learning|nursery|tutoring/g],
  ["trades",   /hvac|plumb|roof|electric|landscap|\blawn\b|contractor|remodel|construction|heating|cooling|garage door|handyman|concrete|fencing|excavat|hardscape/g],
  // Retail / e-commerce: the site SELLS PRODUCTS. These signals (cart,
  // shipping, SKUs) are structural, so they outrank incidental keyword hits.
  ["retail",   /add to cart|shop now|free shipping|in stock|out of stock|\bsku\b|checkout|your cart|product details|shop all|best sellers|new arrivals|\bshop\b/g],
  // Broad clinic catch-all last (low weight — see detectVertical).
  ["medical2", /\bclinic\b|\bmedical\b/g],
];

export function detectVertical(text = "") {
  const t = text.toLowerCase();
  const scores = new Map();
  for (const [key, re] of MATCHERS) {
    const hits = (t.match(re) || []).length;
    if (!hits) continue;
    const k = key === "medical2" ? "medical" : key;
    // medical2 is a weak catch-all; retail signals are structural and strong
    const weight = key === "medical2" ? 0.5 : key === "retail" ? 1.5 : 1;
    scores.set(k, (scores.get(k) || 0) + hits * weight);
  }
  if (!scores.size) return "business";
  const [best, bestScore] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  // one weak, incidental hit is not enough to claim an industry
  return bestScore >= 2 ? best : "business";
}

const svc = (h, p) => ({ h, p });

// Deterministic per-prospect variant picker: same slug always renders the same
// copy (stable demos), but neighbouring prospects in the same vertical don't
// read identically — kills the template scent on side-by-side cold calls.
export const vary = (slug, arr) => arr[[...String(slug||'')].reduce((s,c)=>s+c.charCodeAt(0),0) % arr.length];

// Each pack: the CTA/label language + the default section content. `services`
// is the big differentiator — real, industry-specific service names.
export const PACKS = {
  dental: {
    label: "Dental", bookCta: "Book appointment →", imNew: "New Patients",
    hero: (n) => `${n} — gentle dentistry for the whole family.`,
    heroes: [(n) => `${n} — gentle dentistry for the whole family.`, (n) => `Healthy smiles start at ${n}.`, (n) => `${n} — modern dentistry, without the anxiety.`],
    services: [{ h: "Preventive cleanings & exams", p: "Gentle, thorough care that keeps small problems from becoming big ones." }, { h: "Cosmetic & whitening", p: "Brighten and refine your smile — subtle, natural-looking results." }, { h: "Crowns, bridges & implants", p: "Restore damaged or missing teeth with durable, lifelike work." }, { h: "Clear aligners", p: "Straighten your smile discreetly, without brackets or wires." }, { h: "Emergency dental care", p: "In pain? We hold same-day slots for urgent problems." }, { h: "Kids' dentistry", p: "Positive first visits that set kids up for a lifetime of healthy teeth." }],
    offer: { kicker: "New here?", title: "New-patient welcome.", lead: "Exam, X-rays & a gentle cleaning — book this week and we'll take great care of you.", cta: "Claim it →" },
    money: { kicker: "Affordable care", title: "Insurance & financing, made easy.", lead: "We accept most major dental plans and offer flexible financing." },
    trust: ["Same-week appointments", "Most insurance accepted", "Gentle, judgment-free care", "Modern, comfortable office"],
  },
  medical: {
    label: "Medical", bookCta: "Request an appointment →", imNew: "New Patients",
    hero: (n) => `${n} — attentive care, close to home.`,
    heroes: [(n) => `${n} — attentive care, close to home.`, (n) => `Feel better, faster — ${n} is here for you.`, (n) => `${n} — the kind of care that knows your name.`],
    services: [{ h: "Annual physicals & wellness", p: "A yearly check-in that looks at the whole you, not just symptoms." }, { h: "Same-day sick visits", p: "Feeling rough? Call in the morning, be seen the same day." }, { h: "Chronic condition management", p: "Steady, coordinated care for diabetes, blood pressure and more." }, { h: "Preventive screenings", p: "Catch issues early, when they're easiest to treat." }, { h: "On-site labs", p: "Blood work done here — no second trip across town." }, { h: "Telehealth visits", p: "See your provider from your couch when a trip isn't needed." }],
    offer: { kicker: "New patients", title: "Now accepting new patients.", lead: "Most insurance accepted — request a visit that fits your schedule.", cta: "Request a visit →" },
    money: { kicker: "Coverage", title: "Insurance, simplified.", lead: "We work with most major insurers and explain your costs up front." },
    trust: ["Accepting new patients", "Most insurance accepted", "Same-day sick visits", "On-site labs"],
  },
  optometry: {
    label: "Eye Care", bookCta: "Book an eye exam →", imNew: "New Patients",
    hero: (n) => `${n} — clear vision, personal care.`,
    heroes: [(n) => `${n} — clear vision, personal care.`, (n) => `See life clearly with ${n}.`, (n) => `${n} — eye care and eyewear you’ll love.`],
    services: [{ h: "Comprehensive eye exams", p: "More than a prescription check — a full picture of your eye health." }, { h: "Designer eyewear & frames", p: "Frames you'll actually love, fitted by people who care." }, { h: "Contact lens fittings", p: "Comfortable lenses matched precisely to your eyes and life." }, { h: "Dry-eye treatment", p: "Real relief for burning, gritty, tired eyes." }, { h: "Kids' vision care", p: "Gentle exams that catch vision problems before they affect school." }, { h: "LASIK consultations", p: "Find out if you're a candidate — honest answers, no pressure." }],
    offer: { kicker: "New here?", title: "New-patient eye exam.", lead: "A full exam plus time to find frames you love — book this week.", cta: "Book now →" },
    money: { kicker: "Coverage", title: "Vision plans welcome.", lead: "We accept most vision and medical plans and make benefits easy to use." },
    trust: ["Most vision plans accepted", "Huge frame selection", "Kid-friendly", "Latest exam technology"],
  },
  law: {
    label: "Law", bookCta: "Request a free consult →", imNew: "Free Consult",
    hero: (n) => `${n} — steady counsel when it matters most.`,
    heroes: [(n) => `${n} — steady counsel when it matters most.`, (n) => `When it matters, ${n} is in your corner.`, (n) => `${n} — clear answers, strong advocacy.`],
    services: [{ h: "Free initial consultation", p: "Tell us what you're facing; we'll tell you where you stand." }, { h: "Case evaluation & strategy", p: "A clear-eyed read on your options before you commit to anything." }, { h: "Negotiation & settlement", p: "Most matters resolve without trial — we push for the best terms." }, { h: "Trial representation", p: "If it goes to court, you'll want us at the table." }, { h: "Document review", p: "Contracts and agreements reviewed before you sign, not after." }, { h: "Ongoing counsel", p: "A lawyer who already knows your situation, one call away." }],
    offer: { kicker: "No pressure", title: "Start with a free consultation.", lead: "Tell us what you're facing — we'll tell you where you stand, honestly.", cta: "Request a consult →" },
    money: null,
    trust: ["Free initial consult", "Straight answers", "Responsive & discreet", "Decades of combined experience"],
  },
  accounting: {
    label: "Accounting", bookCta: "Book a consultation →", imNew: "New Clients",
    hero: (n) => `${n} — numbers handled, so you can run your business.`,
    heroes: [(n) => `${n} — numbers handled, so you can run your business.`, (n) => `${n} — keep more of what you earn.`, (n) => `Taxes, books and planning — handled by ${n}.`],
    services: [{ h: "Tax preparation & planning", p: "File right, and plan ahead so next year costs you less." }, { h: "Bookkeeping & payroll", p: "Clean books and on-time payroll, off your plate." }, { h: "Business advisory", p: "Numbers turned into decisions: pricing, hiring, growth." }, { h: "Entity & startup setup", p: "Start the right way — structure, registrations, tax elections." }, { h: "IRS representation", p: "A letter from the IRS is not a DIY project. We handle it." }, { h: "Financial statements", p: "Lender-ready statements, prepared properly." }],
    offer: { kicker: "New clients", title: "Free 20-minute strategy call.", lead: "Bring last year's return — we'll spot what it's costing you.", cta: "Book the call →" },
    money: null,
    trust: ["Year-round support", "Proactive tax planning", "Clear flat pricing", "Responsive & local"],
  },
  insurance: {
    label: "Insurance", bookCta: "Get a free quote →", imNew: "Free Quote",
    hero: (n) => `${n} — the right coverage, explained plainly.`,
    heroes: [(n) => `${n} — the right coverage, explained plainly.`, (n) => `${n} — coverage that fits your life, not a script.`, (n) => `Protect what matters, with ${n}.`],
    services: [{ h: "Auto insurance", p: "The right coverage for how you actually drive." }, { h: "Home & renters", p: "Protect the place you live and everything in it." }, { h: "Life insurance", p: "Straight answers about protecting the people who depend on you." }, { h: "Business coverage", p: "Liability, property and more — matched to your operation." }, { h: "Umbrella policies", p: "An extra layer of protection when the worst happens." }, { h: "Free policy review", p: "Bring your current policy; we'll find the gaps and the savings." }],
    offer: { kicker: "No obligation", title: "Free policy review.", lead: "Send your current policy — we'll find gaps and savings, no pressure.", cta: "Get my review →" },
    money: null,
    trust: ["Independent — we shop for you", "Free policy reviews", "Local, licensed agents", "Claims help when you need it"],
  },
  mortgage: {
    label: "Mortgage", bookCta: "Get pre-approved →", imNew: "Get Started",
    hero: (n) => `${n} — home financing without the runaround.`,
    heroes: [(n) => `${n} — home financing without the runaround.`, (n) => `${n} — from pre-approval to keys in hand.`, (n) => `The right loan at the right rate — ${n}.`],
    services: [{ h: "Purchase loans", p: "From offer to keys, with a lender who answers the phone." }, { h: "Refinancing", p: "Lower the rate, shorten the term, or pull equity — we'll run the math." }, { h: "First-time buyer programs", p: "Down-payment help and loans built for first-timers." }, { h: "FHA / VA loans", p: "Government-backed options, handled by people who know them." }, { h: "Jumbo loans", p: "Financing for higher-value homes without the runaround." }, { h: "Rate & payment consult", p: "A real number for your budget in one short call." }],
    offer: { kicker: "No cost", title: "Free pre-approval.", lead: "Know your budget before you shop — a quick call gets you a real number.", cta: "Start pre-approval →" },
    money: null,
    trust: ["Fast pre-approvals", "Local decisions", "Clear on rates & fees", "Guidance start to finish"],
  },
  title: {
    label: "Title & Escrow", bookCta: "Open an order →", imNew: "Start a File",
    hero: (n) => `${n} — closings that actually close on time.`,
    heroes: [(n) => `${n} — closings that actually close on time.`, (n) => `${n} — smooth closings, zero surprises.`, (n) => `From contract to keys, ${n} handles it.`],
    services: [{ h: "Title search & insurance", p: "Know the property is clean before money moves." }, { h: "Escrow & settlement", p: "Neutral, careful handling of every dollar and document." }, { h: "Refinance closings", p: "Fast, accurate closings that keep your lender happy." }, { h: "Commercial transactions", p: "Complex deals handled with the diligence they demand." }, { h: "1031 exchanges", p: "Defer taxes the right way, with deadlines managed." }, { h: "Wire-fraud protection", p: "Verified instructions and safeguards on every transfer." }],
    offer: { kicker: "For agents & lenders", title: "Open your next order online.", lead: "Fast title commitments and a closing team that communicates.", cta: "Open an order →" },
    money: null,
    trust: ["On-time closings", "Wire-fraud safeguards", "Responsive closing team", "Purchase, refi & commercial"],
  },
  medspa: {
    label: "Med Spa", bookCta: "Book your visit →", imNew: "Book Now",
    hero: (n) => `${n} — natural results, no pressure.`,
    heroes: [(n) => `${n} — natural results, no pressure.`, (n) => `Look like yourself on your best day — ${n}.`, (n) => `${n} — expert aesthetics, honest guidance.`],
    services: [{ h: "Injectables & neuromodulators", p: "Soften lines while keeping expression — measured, natural results." }, { h: "Dermal fillers", p: "Restore volume and balance with an artistic touch." }, { h: "Laser & IPL", p: "Target sun damage, redness and texture with modern laser care." }, { h: "Medical facials", p: "Clinical-grade treatments that go deeper than a spa day." }, { h: "Body contouring", p: "Non-surgical shaping for stubborn areas." }, { h: "Skin consultations", p: "A personal plan for your skin — always free." }],
    offer: { kicker: "New here?", title: "New-client credit.", lead: "Consultation is always free — book this week and we'll credit your first treatment.", cta: "Claim it →" },
    money: { kicker: "Financing", title: "Flexible payment options.", lead: "Treatment plans and financing so you can start when you're ready." },
    trust: ["Physician-led", "Free consultations", "Natural-looking results", "5-star rated"],
  },
  trades: {
    label: "Home Services", bookCta: "Get a free estimate →", imNew: "Free Estimate",
    hero: (n) => `${n} — dependable work, done right the first time.`,
    heroes: [(n) => `${n} — dependable work, done right the first time.`, (n) => `${n} — on time, on budget, done right.`, (n) => `Big job or small fix, ${n} has you covered.`],
    services: [{ h: "Free on-site estimates", p: "We come out, look at the real job, and give you a straight price." }, { h: "Repairs & installation", p: "Done right the first time, by licensed pros." }, { h: "Emergency service", p: "When it can't wait, neither do we." }, { h: "Scheduled maintenance", p: "Small tune-ups that prevent expensive failures." }, { h: "Upfront pricing", p: "The price we quote is the price you pay." }, { h: "Licensed & insured crews", p: "Background-checked pros you can trust in your home." }],
    offer: { kicker: "This season", title: "Free, no-obligation estimate.", lead: "Tell us the job — we'll come out, take a look, and give you a straight price.", cta: "Get my estimate →" },
    money: { kicker: "Financing", title: "Financing on bigger jobs.", lead: "Approved financing options so a big repair doesn't wait." },
    trust: ["Licensed & insured", "Upfront pricing", "Emergency service", "Satisfaction guaranteed"],
  },
  childcare: {
    label: "Childcare & Education", bookCta: "Schedule a tour →", imNew: "Schedule a Tour",
    hero: (n) => `${n} — where curious kids love to learn.`,
    heroes: [(n) => `${n} — where curious kids love to learn.`, (n) => `${n} — a safe, joyful place to grow.`, (n) => `Little learners thrive at ${n}.`],
    services: [{ h: "Infant & toddler care", p: "Warm, attentive care in those precious first years." }, { h: "Preschool program", p: "Play-based learning that makes kids love school." }, { h: "Pre-K readiness", p: "Kindergarten-ready — confident, curious, prepared." }, { h: "Before & after care", p: "Flexible hours that work like you do." }, { h: "Summer programs", p: "Summers full of projects, play and friends." }, { h: "Enrichment activities", p: "Music, movement, art and more, built into every week." }],
    offer: { kicker: "Come see us", title: "Schedule a tour.", lead: "The best way to feel the difference is to visit — we'd love to show you around.", cta: "Book a tour →" },
    money: null,
    trust: ["Licensed & accredited", "Low child-to-teacher ratios", "Safe, secure campus", "Nurturing, qualified staff"],
  },
  retail: {
    label: "Shop", bookCta: "Shop now →", imNew: "Shop",
    hero: (n) => `${n} — gear you can count on, shipped fast.`,
    book: { title: "Questions before you order?", sub: "Real people answer — get sizing, fit and compatibility help before you buy." },
    services: ["Quality products, tested by us", "Fast, tracked shipping", "Easy returns & exchanges", "Expert product support", "Secure checkout", "Order updates that keep you posted"],
    offer: { kicker: "New here?", title: "Join the list, get first dibs.", lead: "New products, restocks and subscriber-only deals — no spam, unsubscribe anytime.", cta: "Sign me up →" },
    money: null,
    trust: ["Fast, tracked shipping", "Easy returns", "Secure checkout", "Real product support"],
  },
  business: {
    label: "Local Business", bookCta: "Get in touch →", imNew: "Get Started",
    hero: (n) => `${n} — trusted service, close to home.`,
    heroes: [(n) => `${n} — trusted service, close to home.`, (n) => `${n} — local, dependable, easy to work with.`, (n) => `You’ll be glad you called ${n}.`],
    services: [{ h: "Free consultation", p: "Start with a conversation — no cost, no pressure." }, { h: "Personalized service", p: "You'll work with people who know your name and your story." }, { h: "Experienced team", p: "Years of doing this well, put to work for you." }, { h: "Fair, upfront pricing", p: "Clear quotes. No surprises on the invoice." }, { h: "Local & dependable", p: "We live here too — our reputation is the business." }, { h: "Satisfaction guaranteed", p: "If it's not right, we make it right." }],
    offer: { kicker: "New here?", title: "Let's talk.", lead: "Tell us what you need — we'll take it from there.", cta: "Get in touch →" },
    money: null,
    trust: ["Locally owned", "Upfront pricing", "Experienced team", "Great reviews"],
  },
};

// Build the site-engine `sections` object for a business vertical.
// realReviews: array of {q, name} captured from the prospect (optional). When
// absent, the reviews section is OMITTED entirely — we never invent reviews.
export function buildSections(vertical, name, { realReviews = [], rating = null, reviewCount = null, realServices = [], serviceDetails = [], slug = "" } = {}) {
  const pk = PACKS[vertical] || PACKS.business;
  const v = (arr) => vary(slug || name, arr);
  // Best → worst: captured services WITH their own descriptions (LLM pass),
  // captured service names, vertical pack defaults.
  const detailed = (serviceDetails || []).filter((s) => s && s.h);
  const items = detailed.length >= 3 ? detailed.map((s) => svc(s.h, s.p || ""))
    : realServices && realServices.length >= 3 ? realServices.map((s) => svc(s, ""))
    : pk.services.map((s) => (typeof s === "string" ? svc(s, "") : s));   // packs ship {h,p}
  const sections = {
    // packs may override the "book" band (retail says "questions before you
    // order?", not "book online")
    book: pk.book || {
      title: v(["Ready when you are.", "Let's get you on the calendar.", "Your next visit starts here."]),
      sub: v([
        "Book online in under a minute — new clients welcome.",
        "Pick a time that works and we'll handle the rest.",
        "Two clicks and you're booked — or just give us a call.",
      ]),
    },
    services: { kicker: "Our services", title: v(["How we can help.", "What we do.", "Care, tailored to you."]), items },
    offer: pk.offer || undefined,
    hours: {},
    cta: {
      title: v(["Let's get started.", "Ready when you are.", "Your first visit starts here."]),
      lead: pk.offer?.lead || "Reach out and we'll take great care of you.",
    },
  };
  if (pk.money) sections.money = pk.money;
  if (pk.trust) sections.trust = { items: pk.trust };
  // Reviews: ONLY when real ones were captured. No fabrication.
  if (realReviews && realReviews.length) {
    sections.reviews = {
      kicker: "What people say",
      title: v(["Trusted across the community.", "Don't take our word for it.", "What our clients actually say."]),
      rating: rating || undefined, count: reviewCount || undefined,
      items: realReviews.slice(0, 6).map((r) => ({ q: r.q || r.quote, name: r.name || "Verified customer" })),
    };
  }
  return { sections, pack: pk };
}

export default { detectVertical, PACKS, buildSections };
