// Shared verification gate for every business design module.
// Usage: node engine/business-designs/_verify.mjs <design>
// Renders a MEDSPA (Lumina Aesthetics) through the given design and asserts
// that all the dental-sample content was replaced by the profile's content.
import { renderBusiness } from "../business-designs.mjs";

export const TEST_BIZ = {
  slug: "lumina",
  name: "Lumina Aesthetics",
  nameShort: "Lumina",
  vertical: "medspa",
  locale: "Cherry Creek, Denver",
  phone: "(720) 555-0188",
  bookUrl: "#book",
  hero: "/assets/business/hero.jpg",
  founded: "2016",
  rating: "4.9",
  reviewCount: "800+",
  tagline: "Aesthetics that still look like you.",
  headline: { lead: "Confidence,", accent: "quietly restored." },
  lede: "Physician-led injectables, laser, and skin — natural results, no pressure, in a calm Cherry Creek studio.",
  offer: { price: "$100", title: "New-client credit", desc: "$100 toward your first treatment — consultation always free." },
  trust: ["Physician-led", "Free consultations", "10,000+ treatments", "5-star rated"],
  services: [
    { name: "Neuromodulators", desc: "Botox & Dysport — soften lines, keep expression." },
    { name: "Dermal Filler", desc: "Restore volume and balance, subtly." },
    { name: "Laser & IPL", desc: "Tone, texture, and sun damage." },
    { name: "Medical Facials", desc: "Medical-grade skin, real glow." },
    { name: "Body Contouring", desc: "Non-invasive fat reduction." },
  ],
  reviews: [
    { quote: "I finally look rested instead of done. Nobody can tell — they just ask if I've been on vacation.", name: "Priya S." },
    { quote: "They talked me out of a treatment I didn't need. That's why I trust them with the ones I do.", name: "Danielle R." },
  ],
  hours: [
    { label: "Mon–Thu", time: "9:00 – 7:00" },
    { label: "Fri", time: "9:00 – 5:00" },
    { label: "Sat", time: "By appointment" },
  ],
};

export async function verify(design) {
  const out = await renderBusiness(TEST_BIZ, design);
  // dental-sample leftovers that must be GONE
  const dentalGone = !/invisalign|dentistry you'll|cleaning|\$99/i.test(out);
  const checks = {
    "renders non-empty": out.length > 2000,
    "name swapped": out.includes("Lumina"),
    "headline swapped": out.includes("quietly restored") && !/look forward to/i.test(out),
    "lede swapped": out.includes("Physician-led injectables"),
    "services swapped": out.includes("Neuromodulators") && out.includes("Body Contouring"),
    "offer swapped": out.includes("$100") && out.includes("New-client credit"),
    "reviews swapped": out.includes("Priya S.") && out.includes("Danielle R."),
    "hours swapped": out.includes("By appointment"),
    "phone swapped": out.includes("(720) 555-0188"),
    "no dental-sample leftovers": dentalGone,
  };
  let ok = true;
  for (const [k, v] of Object.entries(checks)) { console.log((v ? "✓" : "✗") + "  " + k); if (!v) ok = false; }
  console.log(ok ? `\n${design}: ALL CHECKS PASS` : `\n${design}: FAILURES ABOVE`);
  return { ok, out };
}

if (process.argv[1] && process.argv[1].endsWith("_verify.mjs")) {
  const design = process.argv[2];
  if (design) verify(design).then(({ ok }) => process.exit(ok ? 0 : 1));
}
