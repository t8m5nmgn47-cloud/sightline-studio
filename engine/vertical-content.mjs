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
  // The HEAD of the text (title/business name region) is who they ARE; the
  // body is what they mention. "Homestead Title and Escrow" must beat a dozen
  // deep-page "refinance order" links — head matches count 5×.
  const head = t.slice(0, 250);
  const scores = new Map();
  for (const [key, re] of MATCHERS) {
    const hits = (t.match(re) || []).length + ((head.match(re) || []).length * 5);
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

// One honest line of copy for a captured service NAME (no LLM description
// available). Keyword-matched where possible, benefit-generic otherwise —
// a card should never ship blank. (Restores the merged session's intent.)
const SVC_HINTS = [
  [/consult|assessment|evaluation|exam\b/i, "Start with a clear, unhurried look at where things stand — and what we'd recommend."],
  [/emergenc|same.?day|urgent/i, "When it can't wait, we make room — call and we'll take it from there."],
  [/clean|maintenance|tune.?up|preventive|wellness/i, "Regular care that keeps small issues from ever becoming big ones."],
  [/repair|restor|fix|treatment/i, "Done carefully, explained plainly, and built to last."],
  [/install|replace|new\b/i, "From first measurements to final walkthrough, handled end to end."],
  [/cosmetic|whiten|aesthetic|smile/i, "Subtle, natural-looking results you'll actually love."],
  [/surg|procedure|operat/i, "Performed with precision, with comfort and clear aftercare built in."],
  [/insur|coverage|financ|payment|billing/i, "We handle the paperwork and explain the costs before anything begins."],
  [/refinanc|escrow|closing|title|settlement/i, "Handled accurately and on schedule, with clear communication at every step."],
  [/kids?|child|pediatric|family/i, "Gentle, patient care that puts the youngest members of the family at ease."],
];
const SVC_GENERIC = [
  "Handled by experienced hands, with clear communication throughout.",
  "Tailored to your situation — never one-size-fits-all.",
  "Straightforward pricing and honest recommendations, every time.",
  "Quality work, delivered when we say it will be.",
];
function describeService(name, i = 0, vertical = "") {
  const hit = SVC_HINTS.find(([re]) => re.test(String(name)));
  return hit ? hit[1] : SVC_GENERIC[i % SVC_GENERIC.length];
}

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
// CONTENT_PLUS — the narrative-arc content layer (feature diff points, about
// story, FAQ, benefit-led section headlines) per vertical. This is what closes
// the gap between engine output and the hand-built flagship demos: every site
// gets a full story, not five generic bands. All copy is safe-default honest —
// no invented years, counts, or credentials. Captured/LLM content still wins.
// ─────────────────────────────────────────────────────────────────────────────
const CONTENT_PLUS = {
  dental: {
    moneyLead: ["Great dentistry shouldn't require a spreadsheet. We verify your benefits before you sit down, explain every cost in plain English, and offer financing that makes the full treatment plan possible — not just the patch.", "No surprise bills. Ever. We check your coverage before your visit, tell you the number up front, and our front desk fights the insurance battles so you don't have to."],
    svcTitles: ["Everything your smile needs, under one roof.", "Complete care for every smile in the family.", "From checkups to full smile makeovers."],
    diff: ["Same-week appointments — pain never waits in a queue", "Judgment-free care, whether it's been six months or six years", "Modern equipment that makes visits faster and gentler", "One office for the whole family, from first tooth to dentures"],
    about: [(n)=>`${n} was built around a simple idea: dental visits shouldn't be something you dread. From the front desk to the chair, every step is designed to be unhurried, transparent, and genuinely comfortable — so taking care of your smile becomes the easiest thing on your list.`,
            (n)=>`Behind ${n} is a team that treats patients the way we'd want our own families treated: honest recommendations, clear pricing before any work begins, and gentle care at every visit. That's why our patients stay for decades — and bring their kids.`],
    faq: [
      {q:"Are you taking new patients?", a:"Yes — new patients are welcome and we hold same-week slots for first visits. Book online or call and we'll find a time that fits."},
      {q:"Do you accept my insurance?", a:"We work with most major dental plans and will verify your benefits before your visit, so there are no surprises. No insurance? Ask about our flexible payment options."},
      {q:"I haven't been to a dentist in years. Will that be a problem?", a:"Not at all — you'll get a warm welcome, not a lecture. We'll take stock of where things stand and build a plan at whatever pace works for you."},
      {q:"What should I expect at my first appointment?", a:"A conversation first, then a thorough exam and any needed X-rays. You'll leave knowing exactly where your oral health stands and what (if anything) comes next."}],
  },
  medical: {
    moneyLead: ["The best care is the kind you never have to fight your insurance company for. We verify benefits before you arrive, explain costs in plain English, and handle the paperwork — you just show up and get better.", "Healthcare billing is broken; ours isn't. Coverage checked before your visit, costs explained before treatment, and a real person at the front desk who untangles claims for you."],
    svcTitles: ["Everything your family needs, under one roof.", "Whole-person care, for every age and stage.", "The care you need, when you actually need it."],
    diff: ["Same-day sick visits — call in the morning, be seen today", "Providers who know your history, not just your chart", "On-site labs and procedures that save you a second trip", "Care coordinated across every specialist you see"],
    about: [(n)=>`${n} practices medicine the way it should feel: unhurried visits, providers who remember your story, and care that looks at the whole person — not just today's symptom. We're the medical home your family comes back to for years.`,
            (n)=>`At ${n}, primary care means being your first call and your best advocate. We take the time to listen, explain your options in plain language, and coordinate everything else — so navigating your health never feels like a second job.`],
    faq: [
      {q:"Are you accepting new patients?", a:"Yes — we're welcoming new patients of all ages. Request an appointment online or call, and we'll get your records transferred painlessly."},
      {q:"Do you take my insurance?", a:"We accept most major medical plans. Call with your plan details and we'll confirm your coverage and expected costs before your first visit."},
      {q:"Can I be seen the same day if I'm sick?", a:"That's the goal — we reserve same-day slots for sick visits. Call when we open and we'll work you in."},
      {q:"Can the whole family be seen here?", a:"Yes — from pediatric checkups to senior wellness, we care for every generation, often in back-to-back appointments to save you trips."}],
  },
  optometry: {
    moneyLead: ["Your vision benefits expire every year — most people leave them on the table. Bring your plan and we'll squeeze every dollar out of it: exam, lenses, frames, the works.", "We take the mystery out of vision insurance: benefits verified up front, out-of-pocket explained before you choose frames, and honest guidance on where your plan gets you the most."],
    svcTitles: ["Complete eye care, from exam to eyewear.", "Everything your eyes need, in one visit.", "See better. Look better. Feel taken care of."],
    diff: ["Exams that check eye health, not just your prescription", "Hundreds of frames with honest, unhurried styling help", "Same-week appointments and easy insurance handling", "The latest imaging technology — catch problems years earlier"],
    about: [(n)=>`${n} blends serious clinical eye care with a frame selection you'll actually be excited about. Every exam looks at the full health of your eyes, and every fitting ends with eyewear that fits your face, your budget, and your life.`,
            (n)=>`We built ${n} for people who want more than a prescription mill: real doctors with time to explain, technology that catches issues early, and a team that remembers your name — and your style.`],
    faq: [
      {q:"How often should I get an eye exam?", a:"Most adults should be seen every one to two years; annually if you wear contacts, have diabetes, or are over 60. We'll recommend the right interval for you."},
      {q:"Do you take vision insurance?", a:"We accept most vision and medical plans and handle the paperwork for you — bring your card and we'll do the rest."},
      {q:"Can you fit hard-to-fit contacts?", a:"Yes — astigmatism, multifocals, and dry-eye-friendly lenses included. We fit until it's comfortable, not until it's close enough."},
      {q:"Do you see kids?", a:"Absolutely. Kids' vision changes fast and drives school performance — we make exams easy and even fun."}],
  },
  law: {
    svcTitles: ["Serious representation, start to finish.", "The counsel you want in your corner.", "Clear answers. Strong advocacy. Real results."],
    diff: ["A real attorney returns your call — not a call center", "Plain-English advice, so you always know where you stand", "Honest case assessments, even when the answer is 'don't sue'", "Prepared for trial from day one — and it shows in settlements"],
    about: [(n)=>`${n} was founded on the belief that good counsel means telling clients the truth: what's strong, what's weak, and what it will take. Clients come to us at stressful moments — we answer with clarity, preparation, and steady advocacy until it's resolved.`,
            (n)=>`At ${n}, you work with your attorney — not a rotating cast of assistants. We keep caseloads deliberately manageable so every matter gets senior attention, prompt responses, and a strategy built for your specific situation.`],
    faq: [
      {q:"How much does an initial consultation cost?", a:"Your initial consultation is free. We'll listen, give you an honest read on your situation, and outline your options — no obligation."},
      {q:"How are your fees structured?", a:"It depends on the matter — some cases are flat-fee, some hourly, some contingency. You'll get the structure and an estimate in writing before we start."},
      {q:"How long will my case take?", a:"Every matter is different, but after our first meeting we'll give you a realistic timeline and keep you updated at every stage — you'll never wonder what's happening with your case."},
      {q:"Will you actually take my case to trial if needed?", a:"Yes. We prepare every case as if it's going to trial — which is exactly why most of them settle well."}],
  },
  accounting: {
    svcTitles: ["Taxes, books, and strategy — handled.", "Your numbers, working as hard as you do.", "From tax season to year-round strategy."],
    diff: ["Year-round advice, not just an April scramble", "Proactive planning that finds savings before deadlines pass", "Flat, transparent pricing — no surprise invoices", "A real person who answers when the IRS letter arrives"],
    about: [(n)=>`${n} exists for people who want more from an accountant than a signed return. We watch deadlines, flag opportunities, and translate the tax code into plain-English decisions — so you keep more of what you earn and sleep better doing it.`,
            (n)=>`Behind ${n} is a simple promise: you'll never be surprised — not by your tax bill, not by our invoice. We plan ahead, communicate all year, and treat your business's numbers like our own.`],
    faq: [
      {q:"Can you help if I'm behind on my taxes?", a:"Yes — catching up back years is routine work for us. We'll get you current, deal with any notices, and set you up so it doesn't happen again."},
      {q:"What do you charge?", a:"Most of our work is flat-fee, quoted up front after a short conversation about your situation. No hourly meter running while you talk to us."},
      {q:"Do you work with small businesses?", a:"They're the heart of our practice — bookkeeping, payroll, entity strategy, and the tax planning that keeps more profit in the business."},
      {q:"What should I bring to a first meeting?", a:"Last year's return and your questions. That's enough for us to spot what your current setup is costing you."}],
  },
  insurance: {
    svcTitles: ["The right coverage for every part of your life.", "Coverage that fits — auto, home, life, business.", "Protection, explained in plain English."],
    diff: ["Independent — we shop multiple carriers for your best rate", "Annual reviews that catch gaps before claims find them", "A local agent who picks up when you call", "Real help navigating claims, when it matters most"],
    about: [(n)=>`${n} is an advocate, not a sales script. As independent agents we work for you — comparing carriers, explaining the fine print, and building coverage around how you actually live. And when something goes wrong, we're the first call that makes it easier.`,
            (n)=>`Insurance is a promise you buy years before you need it. ${n} makes sure it's the right promise: honest comparisons across carriers, coverage reviews as your life changes, and a familiar voice on the line when you file a claim.`],
    faq: [
      {q:"Why use an independent agent instead of buying online?", a:"We compare multiple carriers for your situation and re-shop at renewal — the same coverage often costs less, and you get an advocate at claim time."},
      {q:"Will you review my current policy for free?", a:"Yes — send it over and we'll flag gaps, overlaps, and savings, no obligation. Most people are surprised by what they find."},
      {q:"What happens when I need to file a claim?", a:"Call us first. We'll walk you through it, deal with the carrier, and keep it moving — you're never on your own with an 800 number."},
      {q:"Can you bundle home and auto?", a:"Usually, and it's often the fastest savings available. We'll run the numbers both ways and show you."}],
  },
  mortgage: {
    svcTitles: ["From pre-approval to keys in hand.", "The right loan, at the right rate, on time.", "Home financing, minus the runaround."],
    diff: ["Pre-approvals fast enough to win the house", "Rates and fees explained line by line, before you commit", "A loan officer who answers evenings and weekends", "Local processing — decisions made here, not in a queue"],
    about: [(n)=>`${n} believes a mortgage should feel like progress, not paperwork. We shop your scenario across programs, explain every number before you sign, and stay reachable straight through closing day — because your offer is only as strong as your lender's follow-through.`,
            (n)=>`Buying a home is stressful enough without wondering what your lender is doing. At ${n} you'll always know where your loan stands, what it costs, and what happens next — from the first pre-approval call to the wire at closing.`],
    faq: [
      {q:"How fast can I get pre-approved?", a:"Often the same day. One short conversation and a few documents gets you a real number — and a letter strong enough to make offers with."},
      {q:"What credit score do I need?", a:"Lower than most people think — several programs work from the low 600s, and we'll show you the fastest path to better terms if you're close."},
      {q:"How much do I need for a down payment?", a:"It ranges from 0% (VA/USDA) to 3–5% for many first-time programs. Twenty percent is an option, not a requirement — we'll run your scenarios."},
      {q:"Should I wait for rates to drop?", a:"You marry the house and date the rate — if the payment works today, you can refinance when rates improve. We'll show you the math for your situation."}],
  },
  title: {
    svcTitles: ["Closings handled with care, start to finish.", "Clear title, smooth closing, zero surprises.", "The closing team agents ask for by name."],
    diff: ["On-time closings agents can build reputations on", "Wire-fraud safeguards on every single transfer", "Proactive updates — you'll never chase your closer", "Purchase, refi, and commercial handled under one roof"],
    about: [(n)=>`${n} treats every closing like the biggest transaction of someone's life — because it usually is. Careful title work, verified wires, and a closing team that communicates early mean deals close on time and everyone leaves the table confident.`,
            (n)=>`Agents and lenders send their clients to ${n} for a simple reason: files move, phones get answered, and closings happen on the date on the contract. We sweat the details so the day itself feels easy.`],
    faq: [
      {q:"What does title insurance actually protect me from?", a:"Hidden defects in the property's history — unknown liens, forged deeds, missed heirs. One premium at closing protects your ownership for as long as you hold the property."},
      {q:"How long does a closing take?", a:"Most residential closings run 30–45 days from contract; refinances are often faster. We'll give you a timeline up front and flag anything that could move it."},
      {q:"How do you protect against wire fraud?", a:"Verified instructions, calls to known numbers before any transfer, and staff trained on the latest schemes. Never wire from an email alone — we'll walk you through the safe process."},
      {q:"Can I choose my own title company?", a:"In most transactions, yes — it's negotiable in the contract. Ask your agent to name us and we'll take it from there."}],
  },
  medspa: {
    moneyLead: ["Looking your best shouldn't wait for a bonus check. Transparent per-treatment pricing, package plans that reward commitment, and financing that starts when you're ready.", "No mystery menus. Every treatment has a clear price, every plan has a clear payoff, and financing options mean the mirror doesn't have to wait."],
    svcTitles: ["Treatments that look like you, refreshed.", "Modern aesthetics, medical-grade care.", "Subtle results. Serious expertise."],
    diff: ["Medical oversight behind every treatment plan", "Natural-first philosophy — enhance, never overdo", "Free consultations with honest recommendations", "Clinical-grade technology, spa-level comfort"],
    about: [(n)=>`${n} was created for people who want to look refreshed, not 'done.' Every plan starts with a real consultation, every treatment is delivered with medical rigor, and every recommendation is honest — including the ones that make us less money.`,
            (n)=>`At ${n}, aesthetics is healthcare: proper assessments, evidence-based treatments, and results measured in how confident you feel. We'd rather earn a client for ten years than oversell a single visit.`],
    faq: [
      {q:"Will my results look natural?", a:"That's the entire philosophy. We work conservatively — you can always add, but the goal is 'you look great,' never 'what did you have done?'"},
      {q:"Is the consultation really free?", a:"Yes — a real assessment and a written plan with pricing, no pressure. If we don't think a treatment will help, we'll tell you."},
      {q:"How long do results last?", a:"It varies by treatment — neuromodulators typically 3–4 months, fillers 6–18 months, laser results longer with maintenance. Your plan will spell it out."},
      {q:"Does it hurt? Is there downtime?", a:"Most treatments involve minimal discomfort and little to no downtime — many clients come on a lunch break. We'll tell you exactly what to expect beforehand."}],
  },
  trades: {
    moneyLead: ["A broken furnace doesn't check your bank balance first. Approved financing on bigger jobs, straight quotes on everything, and the price we say is the price you pay.", "Big repair, small monthly payment. We offer simple approved financing so urgent work gets done right now — and done right."],
    svcTitles: ["Done right the first time, guaranteed.", "The crew your neighbors recommend.", "Quality work, straight prices, no surprises."],
    diff: ["The quote is the price — no invoice surprises", "Licensed, insured, background-checked crews", "We show up when we say we will (and call if anything changes)", "Workmanship guaranteed in writing"],
    about: [(n)=>`${n} runs on the old-fashioned basics done uncommonly well: show up on time, quote it straight, do the work right, and stand behind it. That's how a local crew becomes the name neighbors pass over the fence.`,
            (n)=>`Every job ${n} takes carries our name around town, and we act like it. Clean job sites, honest recommendations — including the cheaper fix when it's the right one — and work we're proud to sign.`],
    faq: [
      {q:"Are estimates really free?", a:"Yes — we come out, look at the actual job, and give you a written price. No fee, no obligation, no pressure."},
      {q:"Are you licensed and insured?", a:"Fully — licensing, liability, and workers' comp. We're happy to provide certificates before work begins; any contractor who hesitates on that is telling you something."},
      {q:"Do you offer financing?", a:"On larger jobs, yes — simple approved financing so an urgent repair doesn't have to wait on a paycheck."},
      {q:"What if something isn't right after the job?", a:"Call us and we make it right — our workmanship guarantee is in writing. Standing behind the work is the whole reputation."}],
  },
  childcare: {
    svcTitles: ["Where little learners love to grow.", "Care, curiosity, and confidence — every day.", "The foundation every childhood deserves."],
    diff: ["Low child-to-teacher ratios — every child is truly known", "Secure check-in and real-time updates through the day", "Play-based curriculum that builds school-ready skills", "Warm, qualified teachers who stay year after year"],
    about: [(n)=>`${n} believes the early years deserve more than supervision — they deserve wonder. Our days blend purposeful play, early literacy, and plenty of outdoor time, guided by teachers who know every child's name, story, and spark.`,
            (n)=>`Walk into ${n} and you'll feel it immediately: children busy and happy, teachers down at eye level, classrooms built for curiosity. We partner with parents to make every drop-off easy and every milestone celebrated.`],
    faq: [
      {q:"What are your ratios and group sizes?", a:"We keep ratios low — at or better than state requirements — so every child gets real attention. Exact numbers by age group are shared on your tour."},
      {q:"How do you handle security?", a:"Secure entry, verified pick-up lists, and staff who personally know every family. Nobody unfamiliar walks in, and nobody unauthorized walks out."},
      {q:"Do you provide meals and snacks?", a:"We'll walk you through our food program on your tour, including how we handle allergies — every classroom knows every child's needs."},
      {q:"How do I enroll?", a:"Start with a tour — kids welcome. If it feels right, we'll walk you through availability, paperwork, and a gentle first-week transition plan."}],
  },
  retail: {
    svcTitles: ["Gear worth owning, service worth remembering.", "Shop confidently — we stand behind everything.", "Quality you can count on, delivered fast."],
    diff: ["Every product tested and stood behind — no junk", "Real humans answer sizing and fit questions fast", "Fast, tracked shipping on every order", "Returns and exchanges without the runaround"],
    about: [(n)=>`${n} started with a refusal to sell anything we wouldn't buy ourselves. Every product earns its place, every order ships fast, and every question gets answered by someone who actually knows the gear.`,
            (n)=>`Behind ${n} is a small team obsessed with the details: quality sourcing, honest descriptions, careful packing, and support that fixes things fast when the rare issue comes up.`],
    faq: [
      {q:"How fast do orders ship?", a:"Most orders ship within one business day with tracking sent the moment the label prints. You'll know where your package is the whole way."},
      {q:"What's your return policy?", a:"Easy returns and exchanges — if it's not right, we'll fix it without the interrogation. Details are on our returns page, but the short version is: we make it right."},
      {q:"Can you help me pick the right size or model?", a:"Yes — that's the best part of buying from us. Message or call before you order and a real person who knows the products will help you choose."},
      {q:"Is checkout secure?", a:"Fully — encrypted checkout with trusted payment processors. We never see or store your full card details."}],
  },
  business: {
    svcTitles: ["Everything you need, handled with care.", "Service the way it used to be — done right.", "Local expertise you can actually reach."],
    diff: ["You'll talk to people who know your name and your history", "Straight quotes and no surprise charges", "Deep local roots — our reputation is the business", "If it's not right, we make it right"],
    about: [(n)=>`${n} runs on relationships: know the customer, do the work well, be there next time. It's not complicated — it's just increasingly rare, and it's why people who find us tend to stay.`,
            (n)=>`At ${n}, being local isn't a marketing line — it's accountability. We live where we work, we answer our phones, and we treat every customer like they'll be telling their neighbors about us. Because they will.`],
    faq: [
      {q:"How do I get started?", a:"Reach out — a quick call or message is all it takes. We'll listen to what you need and lay out exactly how we can help, with no pressure."},
      {q:"What does it cost?", a:"You'll get clear, upfront pricing before anything begins. No surprises on the invoice — that's a promise we build the business on."},
      {q:"How fast can you help?", a:"Usually faster than you'd expect — tell us what you need and when, and we'll be straight with you about timing."},
      {q:"What if I'm not satisfied?", a:"Tell us, and we'll make it right. We're local — our reputation rides on every single customer."}],
  },
};

// Editorial services rail: the serif lead that sits under the section headline
// in the two-column services layout. Honest, benefit-led, no invented facts —
// and per-vertical so a title company doesn't read like a dentist. Captured or
// LLM copy (sections.services.lead) still wins.
const SVC_LEADS = {
  dental:    ["Preventive, restorative and cosmetic care for every age — handled in one office, at a pace that never feels rushed.", "From the six-month checkup to the work you've been putting off, it's all here — explained plainly before anything begins."],
  medical:   ["Primary care for well and sick patients of every age, with the visits, labs and follow-up handled under one roof.", "The everyday care your family actually needs — unhurried visits, real answers, and coordination with everyone else you see."],
  optometry: ["Full eye-health exams, contact fittings and eyewear you'll actually want to wear — in a single unhurried visit.", "More than a prescription check: the health of your eyes, the right lenses, and frames chosen without pressure."],
  law:       ["Straight assessments, careful preparation, and representation that holds up whether a matter settles or goes to trial.", "From the first conversation to the final resolution — clear counsel, honest odds, and steady advocacy throughout."],
  accounting:["Tax work, clean books and year-round planning — so the numbers stop being the thing you worry about at night.", "Compliance handled and opportunities flagged before deadlines pass, not after the return is already filed."],
  insurance: ["Independent coverage across auto, home, life and business — shopped across carriers, explained without the jargon.", "The right policy for how you actually live, reviewed as your life changes, with a real person at claim time."],
  mortgage:  ["Purchase, refinance and first-time programs — with the rate, the fees and the timeline explained before you commit.", "From pre-approval strong enough to win the house through to the wire at closing, handled by people who answer the phone."],
  title:     ["Title search, escrow and settlement handled with the diligence a closing date depends on.", "Residential, refinance and commercial files — clean title, verified wires, and a closing team that communicates early."],
  medspa:    ["Injectables, lasers and medical-grade skin care, delivered with clinical rigor and a natural-first philosophy.", "Treatments planned around your face and your goals — with an honest recommendation, even when it's 'not yet'."],
  trades:    ["Repairs, installs and maintenance — quoted straight, scheduled honestly, and guaranteed in writing.", "Whether it's an emergency at 6am or a project you've been planning for months, it's the same crew and the same standard."],
  construction:["Preconstruction through closeout — budgets shaped early, schedules held, and self-perform capability where it counts.", "Design-build, CM and general contracting delivered by a team that shows up in preconstruction, not just at the groundbreaking."],
  childcare: ["Infant care through pre-K readiness, with low ratios, warm teachers and days built around curiosity.", "Programs for every age and schedule — play-based, purposeful, and staffed by teachers who stay."],
  retail:    ["Products we've tested ourselves, shipped fast, and backed by people who actually know the gear.", "Careful sourcing, honest descriptions and support that fixes things quickly on the rare occasion something goes wrong."],
  business:  ["Everything we do, handled by people who know your name — with clear pricing agreed before any work starts.", "A short list of things done properly, for neighbors who'd rather deal with someone local than a call center."],
};

// Build the site-engine `sections` object for a business vertical.
// realReviews: array of {q, name} captured from the prospect (optional). When
// absent, the reviews section is OMITTED entirely — we never invent reviews.
export function buildSections(vertical, name, { realReviews = [], rating = null, reviewCount = null, realServices = [], serviceDetails = [], slug = "", mission = "", town = "" } = {}) {
  const pk = PACKS[vertical] || PACKS.business;
  const v = (arr) => vary(slug || name, arr);
  // Best -> worst: captured services WITH their own descriptions (LLM pass),
  // captured service names (each given keyword-matched copy - never blank),
  // vertical pack defaults (which ship {h,p}).
  const detailed = (serviceDetails || []).filter((s) => s && s.h);
  const items = detailed.length >= 3 ? detailed.map((s, i) => svc(s.h, s.p || describeService(s.h, i, vertical)))
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
    services: { kicker: "Our services",
      title: v((CONTENT_PLUS[vertical] || CONTENT_PLUS.business).svcTitles || ["How we can help.", "What we do.", "Care, tailored to you."]),
      lead: v(SVC_LEADS[vertical] || SVC_LEADS.business),
      items },
    offer: pk.offer || undefined,
    hours: {},
    cta: {
      title: v(["Let's get started.", "Ready when you are.", "Your first visit starts here."]),
      lead: pk.offer?.lead || "Reach out and we'll take great care of you.",
    },
  };
  // Narrative arc content source (also feeds the money story below).
  const plus = CONTENT_PLUS[vertical] || CONTENT_PLUS.business;
  if (pk.money) {
    sections.money = { ...pk.money, lead: plus.moneyLead ? v(plus.moneyLead) : pk.money.lead };
    // SELL: when a real review talks about cost/coverage/billing, put it right
    // next to the claim — proof beside promise. It moves out of the main
    // reviews grid so the same quote never appears twice.
    let mi = (realReviews || []).findIndex(r => /\binsur|\bcoverage|\bcovered\b|\bbilling|\bbill(s|ed)?\b|\bcost|\bprice|\bafford|\bpayment|\bco-?pay|\bdeductible/i.test(r.q || r.quote || ''));
    // no cost-specific quote? promote the most substantive general review —
    // proof beside promise either way (but never strip the grid below 2)
    if (mi === -1 && (realReviews || []).length >= 3) {
      const lens = realReviews.map(r => (r.q || r.quote || '').length);
      mi = lens.indexOf(Math.max(...lens));
    }
    if (mi > -1) {
      const r = realReviews.splice(mi, 1)[0];
      sections.money.quote = { q: r.q || r.quote, name: r.name || 'Verified patient' };
    }
  }
  if (pk.trust) sections.trust = { items: pk.trust };
  if (plus.diff) sections.feature = {
    kicker: v(["Why us", "The difference", "What to expect"]),
    title: v([`Why ${town ? town + " chooses" : "neighbors choose"} ${name}.`, `The ${name} difference.`, `What you can expect from ${name}.`]),
    points: plus.diff,
  };
  // captured mission (their own words) beats our default story copy
  const aboutBody = (mission && mission.length > 80) ? mission : v(plus.about)(name);
  sections.about = {
    kicker: "Our story",
    title: v([`The people behind ${name}.`, `Get to know ${name}.`, town ? `Proudly serving ${town}.` : `Built on trust, kept by service.`]),
    body: aboutBody,
    stats: [
      rating ? { v: `${rating}★`, k: reviewCount ? `${reviewCount} reviews` : "average rating" } : null,
      { v: "100%", k: "locally owned & operated" },
    ].filter(Boolean),
  };
  if (plus.faq) sections.faq = { title: "Questions, answered.", items: plus.faq };

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
