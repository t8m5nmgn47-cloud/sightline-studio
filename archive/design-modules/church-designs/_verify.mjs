// Shared verification gate for every church design module.
// Usage: node engine/church-designs/_verify.mjs <design>
// Renders a Catholic parish (Pax Christi) through the given design and asserts
// that ALL Mission Hills content was replaced by the profile's own content.
import { renderChurch } from "../church-designs.mjs";

export const TEST_CHURCH = {
  name: "Pax Christi",
  nameFull: "Pax Christi Catholic Parish",
  locale: "Highlands Ranch · Lone Tree",
  verse: "Peace I leave with you; my peace I give you.",
  verseRef: "John 14:27",
  headline: { lead: "You belong at the table.", accent: "Come home to Mass." },
  phone: "(303) 799-1036",
  hero: "/assets/captured/missionhills-org/hero-crop.jpg",
  announce: "This week — First Friday Adoration begins at 7:00 PM in the main chapel.",
  lede: "A Catholic community in the south metro — come as you are to the table.",
  campaign: { kicker: "The Renew Our Parish campaign", head: "Restoring the sanctuary for the next generation.", raised: "$1,340,000", goal: "$2,000,000", pct: 67, donors: "980 families pledged" },
  times: [
    { label: "Saturday Vigil", time: "5:00 PM" },
    { label: "Sunday Mass", time: "7:30 · 9:00 · 11:00 AM" },
    { label: "Misa en Español", time: "Domingos 1:00 PM" },
    { label: "Daily Mass", time: "Mon–Fri 8:00 AM" },
  ],
  campuses: [
    { name: "Main Church", note: "The historic parish sanctuary", times: "Sat 5 PM · Sun 7:30, 9 & 11 AM" },
    { name: "Adoration Chapel", note: "Open for prayer daily", times: "6 AM – 9 PM, seven days" },
    { name: "Parish Center", note: "Faith formation & fellowship", times: "Classes weeknights" },
    { name: "Español", note: "Una comunidad, en tu idioma", times: "Domingos 1 PM" },
  ],
  events: [
    { date: "Fri · Jul 11", title: "First Friday Adoration", detail: "Main Chapel · 7:00 PM", cta: "Learn more →" },
    { date: "Sun · Jul 20", title: "RCIA Inquiry Night", detail: "Parish Center · 6:30 PM", cta: "Save my spot →" },
    { date: "Sat · Jul 26", title: "Parish Festival & Blessing", detail: "All families welcome · 11:00 AM", cta: "Details →" },
  ],
  story: { cite: "Elena, parishioner since 2019" },
};

export async function verify(design) {
  const out = await renderChurch(TEST_CHURCH, design);
  const noMH = !/mission hills/i.test(out.replace(/missionhills-org/g, ""));
  const checks = {
    "renders non-empty": out.length > 2000,
    "name swapped": out.includes("Pax Christi"),
    "verse swapped": out.includes("Peace I leave with you"),
    "times swapped": out.includes("Saturday Vigil"),
    "campuses swapped": out.includes("Adoration Chapel"),
    "events swapped": out.includes("RCIA Inquiry Night"),
    "story cite swapped": out.includes("Elena, parishioner"),
    "hero headline swapped": out.includes("Come home to Mass") && !/be made new|find rest/i.test(out),
    "no Mission Hills leftovers": noMH,
    "hero image referenced": out.includes(TEST_CHURCH.hero),
  };
  let ok = true;
  for (const [k, v] of Object.entries(checks)) { console.log((v ? "✓" : "✗") + "  " + k); if (!v) ok = false; }
  console.log(ok ? `\n${design}: ALL CHECKS PASS` : `\n${design}: FAILURES ABOVE`);
  return { ok, out };
}

// Only run as a CLI when invoked directly (not when imported for TEST_CHURCH).
if (process.argv[1] && process.argv[1].endsWith("_verify.mjs")) {
  const design = process.argv[2];
  if (design) verify(design).then(({ ok }) => process.exit(ok ? 0 : 1));
}
