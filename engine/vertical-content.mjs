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
  // Commercial construction / general contracting is B2B — completely different
  // voice from residential home services. Detect it BEFORE the trades catch-all.
  ["construction", /general contractor|preconstruction|pre-construction|design.?build|construction management|self.?perform|cm\/gc|cmgc|commercial construction|civil construction|sitework|earthwork|tenant improvement|owner'?s rep|alternate delivery|ground.?up construction/g],
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
  construction: {
    label: "Commercial Construction", bookCta: "Discuss your project \u2192", imNew: "Work With Us",
    book: { title: "Have a project on the boards?", sub: "Tell us the scope and timeline \u2014 a principal will get back to you within one business day." },
    hero: (n) => `Built right. Delivered on schedule.`,
    services: ["Preconstruction services", "Construction management", "Design-build delivery", "General contracting", "Self-perform capabilities", "Civil & sitework"],
    offer: { kicker: "On the boards?", title: "Let's talk about your next project.", lead: "Bring us in early \u2014 preconstruction input is where budgets and schedules are won.", cta: "Start the conversation \u2192" },
    money: null,
    trust: ["Bonded & fully insured", "Safety-first jobsite culture", "On-time, on-budget delivery", "Self-perform capabilities"],
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
    hero: (n) => `Gear you can count on, shipped fast.`,
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

// ─────────────────────────────────────────────────────────────────────────────
// Service description writer. Captured sites usually yield bare service NAMES;
// a name with no supporting copy reads like a checklist, not a website. This
// gives every card a real sentence: a curated keyword dictionary first (precise,
// service-specific), then rotating vertical-toned fallbacks so no two adjacent
// cards ever share the same filler line. Nothing here fabricates claims —
// no invented years, ratings, or credentials.
// ─────────────────────────────────────────────────────────────────────────────
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const SERVICE_DESC = [
  // dental
  [/clean|hygien|prophy/i, "Gentle, unhurried, and thorough — comfortable even if it's been a while since your last visit."],
  [/whiten/i, "Brighten your smile safely, with results you can see and a shade you'll love."],
  [/implant/i, "A permanent, natural-looking replacement — planned carefully and placed with precision."],
  [/crown|bridge/i, "Restorations matched to your natural teeth, built to look right and last for years."],
  [/invisalign|aligner|orthodont|braces/i, "Straighten your smile discreetly, with a plan mapped out before you commit."],
  [/extract/i, "When a tooth has to go, we make it as calm and comfortable as possible — and plan what comes next."],
  [/root canal|endodont/i, "Modern techniques that save the tooth and end the pain — far gentler than its reputation."],
  [/sealant/i, "A quick, protective coating that shields molars from decay — especially valuable for kids."],
  [/fluoride/i, "A fast, painless treatment that strengthens enamel and helps stop cavities before they start."],
  [/night ?guard|mouth ?guard/i, "Custom-fitted protection against grinding and clenching — your jaw will thank you."],
  [/denture|partial/i, "Comfortable, natural-looking dentures fitted precisely to you — eat and smile with confidence."],
  [/veneer/i, "Thin, hand-finished porcelain that transforms your smile while preserving your natural teeth."],
  [/emergency/i, "In pain? Call now — we hold time for emergencies and will see you as soon as possible."],
  [/kids|pediatric|children/i, "Patient, kid-friendly care that makes the visit fun — building healthy habits early."],
  // medical / optometry / medspa
  [/physical|wellness|annual/i, "A full picture of your health, with time to actually talk — not a rushed fifteen minutes."],
  [/sick visit|same.?day/i, "Feeling rough today? We keep same-day slots open so you're seen when it matters."],
  [/chronic/i, "Ongoing, coordinated care for long-term conditions — one team that knows your history."],
  [/screening|exam/i, "Thorough, unhurried exams with clear explanations of what we find and what it means."],
  [/telehealth|virtual/i, "See your provider from home — secure video visits for the things that don't need a trip in."],
  [/lab/i, "On-site testing means answers in hours, not weeks — no extra trip across town."],
  [/contact lens/i, "Fittings that account for how you actually live — comfort at hour ten, not just hour one."],
  [/frame|eyewear/i, "Hand-picked frames for every face and budget, with honest styling help — no pressure."],
  [/dry.?eye/i, "Real relief for burning, gritty, tired eyes — we treat the cause, not just the symptoms."],
  [/lasik/i, "Find out if you're a candidate and what to expect — straight answers before any commitment."],
  [/botox|neuromod|dysport/i, "Subtle, natural-looking results from experienced injectors — refreshed, never frozen."],
  [/filler/i, "Restore volume and balance with an artist's eye — conservative by default, always your call."],
  [/laser|ipl/i, "Advanced light-based treatments tailored to your skin — with honest guidance on what works."],
  [/facial/i, "Clinical-grade treatments that go deeper than a day spa — visible results, real relaxation."],
  [/body contour|coolsculpt/i, "Non-surgical contouring with realistic expectations set up front — no overselling."],
  // law / finance / insurance
  [/consult/i, "Sit down with us, tell us where things stand, and leave knowing your options — no obligation."],
  [/estate|will|trust/i, "Protect the people you love with documents done right — clear, valid, and built to hold up."],
  [/litigation|trial/i, "Prepared, steady representation when it counts — we know the courtroom and we're ready for it."],
  [/settlement|negotiat/i, "Firm, informed negotiation that protects your interests — we don't blink first."],
  [/tax (?:prep|planning|return)/i, "More than filing — we look for what you're leaving on the table, all year round."],
  [/bookkeep|payroll/i, "Clean books and on-time payroll, handled — so you always know where the business stands."],
  [/advisory|cfo/i, "Numbers turned into decisions: what's working, what isn't, and what to do next quarter."],
  [/audit|irs/i, "If the IRS comes calling, you don't answer alone — we handle it, start to finish."],
  [/auto insurance/i, "The right auto coverage at the right price — shopped across carriers, explained in plain English."],
  [/home|renters/i, "Coverage that actually matches your home and what's in it — reviewed before you need it."],
  [/life insurance/i, "Honest guidance on protecting your family — how much, what kind, and what it really costs."],
  [/policy review/i, "Send us what you have — we'll flag the gaps and the overcharges, free, no strings."],
  [/refinanc/i, "See what today's rates mean for your payment — a real number in minutes, not a sales pitch."],
  [/pre.?approv/i, "Shop with confidence: a solid pre-approval that sellers take seriously, done fast."],
  [/first.?time buyer/i, "First home? We'll walk you through every step and every program you qualify for."],
  [/fha|va loan/i, "Government-backed options explained clearly — including benefits you may not know you've earned."],
  [/title search|title insurance/i, "A clean title, verified — so nothing surfaces after closing that should've been caught before."],
  [/escrow|settlement services|closing/i, "Organized, communicative closings that actually happen on the day they're supposed to."],
  // trades / home services
  [/preconstruction|pre-construction/i, "Budgeting, constructability review, and value engineering before ground breaks — where schedules and budgets are actually won."],
  [/construction management|cm\/gc|cmgc/i, "A single accountable team managing cost, schedule, safety, and quality from day one to closeout."],
  [/design.?build/i, "One contract, one team, from concept through completion — faster delivery and no finger-pointing."],
  [/general contract/i, "Full-scope delivery with rigorous subcontractor management and a jobsite that runs clean, safe, and on schedule."],
  [/self.?perform/i, "Our own crews on the critical path — more schedule control, tighter quality, fewer surprises."],
  [/civil|sitework|earthwork|utilit/i, "Site development done right the first time: earthwork, utilities, and infrastructure that everything else depends on."],
  [/tenant improvement|\bti\b|interior/i, "Occupied-space and interior buildouts delivered with minimal disruption and a firm end date."],
  [/alternate delivery/i, "CM/GC, design-build, progressive delivery — we fit the contract model to the project, not the other way around."],
  [/estimate/i, "We come out, look at the actual job, and give you a straight price — free, no obligation."],
  [/repair/i, "Diagnosed honestly and fixed properly the first time — with the price agreed before we start."],
  [/install/i, "Clean, code-compliant installation by licensed pros — done right, tested, and tidied up after."],
  [/maintenance|tune.?up/i, "Scheduled upkeep that catches small problems while they're still small — and cheap."],
  [/hvac|heating|cooling|furnace|a\/?c/i, "Keep your home comfortable year-round — honest diagnostics, upfront pricing, quality work."],
  [/plumb/i, "From slow drains to full repipes — licensed plumbers who show up when they say they will."],
  [/roof/i, "Inspections, repairs, and replacement with quality materials — documented so insurance is easy."],
  [/landscap|lawn/i, "A yard you're proud of without spending your weekend on it — designed, built, maintained."],
  [/remodel/i, "From first sketch to final walkthrough — a build process you can actually follow and trust."],
  // childcare / general
  [/infant|toddler/i, "Warm, attentive care in those precious early years — low ratios, daily updates, open doors."],
  [/preschool|pre.?k/i, "Play-based learning that gets little ones genuinely ready for kindergarten — and loving school."],
  [/after.?care|before.*care/i, "Safe, engaging hours around the school day — homework help included, chaos not."],
  [/summer/i, "Summers they'll talk about all year — active, creative, and screen-light."],
  [/tour/i, "The best way to know is to see it — come meet the teachers and watch a classroom in action."],
];
const DESC_FALLBACKS = [
  (n) => `${n} handled by people who do this every day — careful work, plain answers, fair pricing.`,
  (n) => `From your first question to the finished result, ${lc(n)} here is thorough and unhurried.`,
  (n) => `We keep ${lc(n)} simple: honest recommendations, careful work, and no surprises on the bill.`,
  (n) => `Ask us about ${lc(n)} — we'll walk you through the options and costs before anything begins.`,
  (n) => `${n}, with the details handled — so you can get back to your day.`,
  (n) => `The kind of ${lc(n)} we'd want for our own family — careful, modern, and honest.`,
];
const PRODUCT_FALLBACKS = [
  (n) => `Designed, tested, and supported by the people who built it — ask us anything before you buy.`,
  (n) => `Precision-made and quality-checked before it ships — with real product support after it arrives.`,
  (n) => `Built to spec and backed by us. If it's not right, we make it right.`,
  (n) => `Ships fast with tracking, arrives ready to work. Questions on fit or compatibility? Just ask.`,
  (n) => `One of our most-asked-about products — see the shop for options, specs, and current pricing.`,
  (n) => `Thoughtfully engineered, honestly priced, and supported long after the sale.`,
];
export function describeService(name, i = 0, vertical = "") {
  if (vertical === "retail") return PRODUCT_FALLBACKS[i % PRODUCT_FALLBACKS.length](name);
  const hit = SERVICE_DESC.find(([re]) => re.test(name));
  return hit ? hit[1] : DESC_FALLBACKS[i % DESC_FALLBACKS.length](name);
}

// Why-us pillar copy: expands each short trust phrase into a supporting line.
const WHY_DESC = [
  [/same.?(week|day)/i, "Life doesn't wait weeks — neither should you. We keep the schedule flexible for new clients."],
  [/insurance/i, "We work with most major plans and verify your coverage before your visit — no billing surprises."],
  [/gentle|judgment|comfort/i, "However long it's been, you'll get warmth, not a lecture. Comfort is designed into every visit."],
  [/modern|technology|latest/i, "Up-to-date tools and techniques — because better equipment means faster, more comfortable care."],
  [/licensed|insured|accredited|physician/i, "Fully credentialed and accountable — you're in qualified hands, and we can prove it."],
  [/upfront|flat|clear.*pric|pricing/i, "You'll know the price before we start. Always. That's not a promotion, it's a policy."],
  [/free (consult|estimate|review|quote|pre)/i, "Starting costs nothing — get real answers and a real number before you commit to anything."],
  [/local|community|family.?owned/i, "We live here too. Our name is on the door, and our neighbors are our reviews."],
  [/emergency/i, "When it can't wait, we answer — call and we'll get you taken care of fast."],
  [/experience|decades|expert/i, "Deep experience means fewer surprises — we've seen your situation before and know the way through."],
  [/response|responsive|communicat/i, "Calls returned, timelines honored, and updates before you have to ask."],
  [/guarantee|satisfaction/i, "We stand behind the work. If something's not right, we make it right."],
  [/natural|results/i, "Results that look like you on your best day — never overdone."],
  [/ratio|nurturing|safe/i, "Small groups, attentive staff, and security you can see — so you can drop off with confidence."],
];
const WHY_FALLBACK = ["It's a promise we take seriously — and one our clients mention again and again.",
  "One of the reasons people come to us first, and come back.",
  "Not a slogan — a standard we hold ourselves to on every visit."];
function describeWhy(phrase, i = 0) {
  const hit = WHY_DESC.find(([re]) => re.test(phrase));
  return hit ? hit[1] : WHY_FALLBACK[i % WHY_FALLBACK.length];
}

// Per-vertical FAQ packs — the questions every prospect in that industry actually
// asks. Generic-safe: nothing invented about the specific business.
const FAQS = {
  dental: [
    ["Do you take my insurance?", "We accept most major dental plans. Call with your plan name and we'll verify your coverage and estimate your out-of-pocket before your visit."],
    ["I haven't been to a dentist in years. Will I be judged?", "Never. It's one of the most common things we hear, and we're just glad you're here. We'll meet you where you are and build a plan at your pace."],
    ["Do you see kids?", "Yes — we love treating whole families, and we make first visits fun so kids grow up unafraid of the dentist."],
    ["What if I have a dental emergency?", "Call us right away. We hold time in the schedule for emergencies and will get you out of pain as fast as possible."],
  ],
  medical: [
    ["Are you accepting new patients?", "Yes — request an appointment online or call, and we'll get you on the schedule quickly."],
    ["Do you take my insurance?", "We work with most major insurers. Call with your plan details and we'll confirm coverage before you're seen."],
    ["Can I be seen today?", "We keep same-day slots for sick visits. Call in the morning and we'll do our best to fit you in."],
    ["Do you offer telehealth?", "Yes — many visits can happen over secure video, so you don't have to leave home for a follow-up."],
  ],
  optometry: [
    ["Do you accept vision insurance?", "Most vision and medical plans, yes. Bring your card and we'll handle the benefits paperwork for you."],
    ["How often should I get my eyes examined?", "Most adults should be seen every one to two years — more often with certain conditions. We'll recommend the right cadence for you."],
    ["Can I get glasses the same day?", "Some prescriptions can be turned around quickly — ask us, and we'll give you an honest timeline for your lenses."],
    ["Do you see children?", "Absolutely. Kids' vision changes fast, and early exams catch problems that affect learning."],
  ],
  medspa: [
    ["Will my results look natural?", "That's the goal, always. We take a conservative, build-slowly approach — you stay in control at every step."],
    ["Is the consultation really free?", "Yes — you'll meet a provider, discuss goals, and get honest recommendations with zero obligation."],
    ["How long do results last?", "It varies by treatment and person — we'll set realistic expectations for your specific plan before you commit."],
    ["Who performs the treatments?", "Trained, credentialed providers under medical direction. Ask us anything about qualifications — we're proud to answer."],
  ],
  law: [
    ["How much does the first meeting cost?", "Nothing. The initial consultation is free — you'll leave understanding your options, whatever you decide."],
    ["How much will my case cost?", "It depends on the matter, and we'll be straight with you about fees before you commit. No surprise bills — ever."],
    ["How long will my case take?", "We'll give you an honest range once we understand the facts, and keep you updated as things develop."],
    ["Will you actually return my calls?", "Yes. Responsiveness is a core promise here — you'll never be left wondering what's happening with your case."],
  ],
  accounting: [
    ["Can you help if I'm behind on my books or taxes?", "That's more common than you think, and yes — we'll get you caught up without the guilt trip."],
    ["Do you work with businesses my size?", "We work with individuals and small-to-mid-size businesses across many industries. Tell us your situation and we'll be honest about fit."],
    ["What do you charge?", "Clear, agreed-in-advance pricing — you'll know the cost before we start, not after."],
    ["Are you available outside tax season?", "Year-round. The biggest savings come from planning before December, not filing in April."],
  ],
  insurance: [
    ["Why use an independent agent instead of going direct?", "We shop multiple carriers for you, so you get the coverage comparison a single company will never show you."],
    ["Does a quote cost anything?", "No — quotes and policy reviews are free, with no obligation to switch."],
    ["Will you help me with a claim?", "Yes. When something goes wrong, you call us, not a 1-800 number — we advocate for you through the process."],
    ["Can you review the policy I already have?", "Please do — most policies we review have a gap or an overcharge the owner didn't know about."],
  ],
  mortgage: [
    ["How fast can I get pre-approved?", "Often within a day. A short conversation plus a few documents gets you a real number sellers respect."],
    ["What credit score do I need?", "Lower than most people fear — programs exist across the range. Ask, and we'll map out your real options."],
    ["What will my rate be?", "Rates change daily and depend on your situation — we'll quote you honestly and explain every fee up front."],
    ["First-time buyer — where do I start?", "Right here. One call and we'll walk you through the whole path, including programs that reduce your down payment."],
  ],
  title: [
    ["What does a title company actually do?", "We verify the property's title is clean, insure it, and handle the money and documents so your closing happens safely and on time."],
    ["How do you protect against wire fraud?", "Verified instructions, calls to confirmed numbers, and secure channels — we treat every wire like the target it is."],
    ["How long does closing take?", "A typical purchase closes in around 30 days from contract. We'll flag anything that could slow yours down, early."],
    ["Can I choose my own title company?", "In most transactions, yes — it's your right. Ask us to open your order and we'll handle it from there."],
  ],
  trades: [
    ["Are estimates really free?", "Yes — we come out, look at the actual job, and give you a straight price. No obligation, no hard sell."],
    ["Are you licensed and insured?", "Fully. We're happy to show documentation before any work begins — you should ask this of anyone you hire."],
    ["Do you handle emergencies?", "Call us. When it can't wait, we prioritize getting someone out to you fast."],
    ["Do you guarantee your work?", "We stand behind every job. If something's not right, we come back and make it right."],
  ],
  construction: [
    ["What project delivery methods do you offer?", "General contracting, CM/GC, and design-build \u2014 we'll recommend the model that fits your project's risk, schedule, and budget profile."],
    ["When should we bring you into a project?", "As early as possible. Preconstruction involvement \u2014 budgeting, constructability, value engineering \u2014 is where the biggest savings live."],
    ["What size projects do you take on?", "Tell us what you're planning \u2014 we'll be straight about fit, and if we're not the right contractor for it, we'll say so."],
    ["How do you manage safety on site?", "A safety-first culture with documented programs, trained crews, and accountability at every level \u2014 ask us about our record and EMR."],
  ],
  childcare: [
    ["What are your ratios and class sizes?", "Small groups with attentive, qualified staff — come tour and we'll show you exactly how each classroom runs."],
    ["How do you handle security?", "Secure entry, checked pickup lists, and staff who know every family by face. Your child's safety is the foundation of everything."],
    ["How will I know how my child's day went?", "Daily updates — what they ate, how they napped, what they learned, and the moments that made us smile."],
    ["How do I enroll?", "Start with a tour. If it feels right, we'll walk you through enrollment and make the transition gentle for your child."],
  ],
  retail: [
    ["How fast is shipping?", "Orders ship quickly with tracking sent the moment it's on the way — you'll always know where your order is."],
    ["What's your return policy?", "Easy returns and exchanges — if it's not right, we'll make it right without the runaround."],
    ["Can I get help choosing before I buy?", "Yes — real people answer our messages. Ask about sizing, fit, or compatibility and we'll give you a straight answer."],
    ["Is checkout secure?", "Fully encrypted, industry-standard payment processing. Your details are never stored where they shouldn't be."],
  ],
  business: [
    ["How do I get started?", "Reach out — a quick conversation is all it takes to see if we're the right fit, and there's no charge to ask."],
    ["What will it cost?", "You'll get clear, upfront pricing before anything begins. No surprises is a policy, not a slogan."],
    ["How soon can you help?", "Usually faster than you'd expect. Tell us what you need and we'll give you an honest timeline."],
    ["Why choose you?", "We're local, accountable, and our reputation rides on every job. Talk to us once and you'll feel the difference."],
  ],
};

// Default About/story copy per vertical — used when the prospect's own captured
// description is missing or too thin to carry an About section.
const STORY = {
  dental: (n) => `${n} was built around a simple idea: dental care works better when nobody dreads the visit. That means unhurried appointments, plain-English explanations, and a team that remembers your name — and your kids' names. Whether it's a routine cleaning or the smile you've been putting off for years, you'll get honest recommendations and care we'd give our own family.`,
  medical: (n) => `${n} practices medicine the way it should feel: a provider who knows your history, appointments that don't feel rushed, and answers you can actually understand. From annual physicals to the mornings you wake up feeling awful, we're the first call — close to home and genuinely on your side.`,
  optometry: (n) => `${n} believes an eye exam should be more than a prescription update. It's protecting the way you see everything — so we take time, use modern diagnostics, and help you walk out in frames you actually love. Clear vision, personal care, no rush.`,
  medspa: (n) => `${n} exists for one kind of result: the kind nobody can quite put their finger on. You look rested. Confident. Like yourself, on your best day. Our providers lead with education and restraint — you'll always know what we recommend, why, and what it costs, before anything happens.`,
  law: (n) => `When you need a lawyer, you're rarely having a good day. ${n} was built for exactly those days: straight answers, steady guidance, and representation that treats your problem with the seriousness it deserves. We return calls, we prepare relentlessly, and we tell you the truth about your case — even when it's not what you hoped to hear.`,
  accounting: (n) => `${n} handles the numbers so you can run the business. But the real value isn't the filing — it's the planning: catching deductions before they're missed, structuring things properly from the start, and giving you a clear picture of where you stand all year round. Clear pricing, proactive advice, and a real person who answers.`,
  insurance: (n) => `${n} works for you, not a carrier. That means we shop multiple companies for the right coverage at the right price, explain your policy in plain English, and pick up the phone when you have a claim. Insurance is a promise — we make sure yours will actually keep it.`,
  mortgage: (n) => `Buying a home is stressful enough without wondering what your lender isn't telling you. ${n} does financing the transparent way: real numbers fast, every fee explained, and guidance from application to keys. Local decisions, honest rates, no runaround.`,
  title: (n) => `A closing should be the easy part. ${n} makes it that way — clean title work, proactive communication, and wire-fraud safeguards that treat your money like our own. Agents and lenders trust us because our closings happen on the day they're supposed to.`,
  trades: (n) => `${n} was built on the radical idea that contractors should show up when they say they will, charge what they quoted, and do the job right the first time. Licensed, insured, and local — our reputation is our best advertising, and we protect it on every single job.`,
  construction: (n) => `${n} builds for owners, developers, and public agencies who need a contractor that performs \u2014 not one that explains. From preconstruction budgeting through closeout, we manage cost, schedule, and quality with our own boots on the ground, self-performing critical work where it protects the schedule. Our reputation is built project by project, and we protect it on every one.`,
  childcare: (n) => `${n} is where children are known — by name, by personality, by the things that make them light up. Our teachers create days full of discovery, our classrooms are safe and warm, and our doors are always open to parents. Come tour, and watch a classroom in action. That tells you more than any website can.`,
  retail: (n) => `${n} started with products we actually use and believe in. Every item is tested, every order ships fast with tracking, and every question gets answered by a real person who knows the products. Shop with confidence — and if something's not right, we'll make it right.`,
  business: (n) => `${n} is local, accountable, and built on repeat customers. We do what we say, charge what we quote, and treat every client like the neighbor they usually are. Get in touch — one conversation and you'll feel the difference.`,
};

// Build the site-engine `sections` object for a business vertical.
// realReviews: array of {q, name} captured from the prospect (optional). When
// absent, the reviews section is OMITTED entirely — we never invent reviews.
export function buildSections(vertical, name, { realReviews = [], rating = null, reviewCount = null, realServices = [], serviceDetails = [], slug = "", gallery = [], description = "", location = "" } = {}) {
  const pk = PACKS[vertical] || PACKS.business;
  const v = (arr) => vary(slug || name, arr);
  // Best -> worst: captured services WITH their own descriptions (LLM pass),
  // captured service names (each given keyword-matched copy - never blank),
  // vertical pack defaults (which ship {h,p}).
  const detailed = (serviceDetails || []).filter((s) => s && s.h);
  const items = detailed.length >= 3 ? detailed.map((s) => svc(s.h, s.p || ""))
    : (realServices && realServices.length >= 3) ? realServices.map((s, i) => svc(s, describeService(s, i, vertical)))
    : pk.services.map((s, i) => (typeof s === "string" ? svc(s, describeService(s, i, vertical)) : s));
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
    services: {
      kicker: vertical === "retail" ? "The lineup" : "Our services",
      title: vertical === "retail" ? "What we make." : v(["How we can help.", "What we do.", "Care, tailored to you."]),
      lead: vertical === "retail" ? `Engineered and tested by ${name} — see the shop for specs and current pricing.` : `Real help from real people — here's what ${name} does best.`,
      items,
    },
    // About/story: their real description when it can carry the section,
    // else vertical-crafted copy. Pairs with a real photo when one exists.
    about: (() => {
      let d = (description || "").replace(/\s+/g, " ").trim()
        .replace(/\s*(?:call|contact)(?: us)?(?: at)?[^.!?]*(?:today|now)!?\s*$/i, "").trim();
      const body = d.length >= 200 ? d : (STORY[vertical] || STORY.business)(name);
      return { kicker: "About us", title: `The story behind ${name}.`, body, image: gallery[1] || gallery[0] || null };
    })(),
    // Why-us pillars from the pack's trust signals — fills the credibility gap
    // when no real reviews were captured, without fabricating any.
    whyus: {
      kicker: "Why choose us", title: "The difference you'll feel.",
      items: (pk.trust || []).map((t, i) => ({ h: t, p: describeWhy(t, i) })),
    },
    faq: {
      kicker: "Good to know", title: "Questions, answered.",
      items: (FAQS[vertical] || FAQS.business).map(([q, a]) => ({ q, a })),
    },
    trust: pk.trust || [],
    offer: pk.offer || undefined,
    hours: {},
    cta: {
      title: v(["Let's get started.", "Ready when you are.", "Your first visit starts here."]),
      lead: pk.offer?.lead || "Reach out and we'll take great care of you.",
    },
  };
  if (gallery && gallery.length >= 3) {
    sections.gallery = { kicker: "Take a look", title: "A glimpse inside.", items: gallery.slice(0, 8) };
  }
  if (pk.money) sections.money = pk.money;
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
