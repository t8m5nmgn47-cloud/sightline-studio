// Distinctness gate — proves that same-vertical businesses come out different.
// Usage: node engine/business-designs/variety-check.mjs
// Renders six dental practices through the recommender and reports, for each:
// design, narrative order, font pack, and shape. Fails (exit 1) if any two
// businesses share ALL four axes, or if fewer than 2 designs / 3 orders are
// used across the set.
import { DESIGNS, recommendBusinessDesign, renderBusiness } from "../business-designs.mjs";
import { TEST_BIZ } from "./_verify.mjs";

const dentists = ["copeland-dental", "cherry-hills-dental", "acacia-dental", "mile-high-smiles", "aspen-dental-co", "castle-pines-dental"];

const fingerprints = [];
for (const slug of dentists) {
  const p = { ...TEST_BIZ, slug, name: slug, vertical: "dental" };
  const design = recommendBusinessDesign(p);
  const html = await renderBusiness(p, design);
  const order = [...html.matchAll(/<section\b[^>]*\bid="([a-z]+)"/g)].map((m) => m[1]).join(">");
  const fonts = (html.match(/css2\?family=([A-Za-z+]+)/) || [])[1] || "default";
  const shape = (html.match(/sl-variety">:root\{--rad:([^}]+)\}/) || [])[1] || "default";
  fingerprints.push({ slug, design, order, fonts, shape });
  console.log(`${slug.padEnd(22)} ${design.padEnd(10)} fonts:${fonts.padEnd(20)} rad:${shape.padEnd(8)} ${order}`);
}

const full = fingerprints.map((f) => `${f.design}|${f.order}|${f.fonts}|${f.shape}`);
const collisions = full.length - new Set(full).size;
const designsUsed = new Set(fingerprints.map((f) => f.design)).size;
const ordersUsed = new Set(fingerprints.map((f) => f.order)).size;
console.log(`\ndesigns used: ${designsUsed} · section orders used: ${ordersUsed} · identical pages: ${collisions}`);
const ok = collisions === 0 && designsUsed >= 2 && ordersUsed >= 3;
console.log(ok ? "VARIETY GATE: PASS" : "VARIETY GATE: FAIL");
if (!ok) process.exit(1);
void DESIGNS;
