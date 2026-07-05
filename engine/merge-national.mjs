// Merge the per-cell bad-site sweep outputs into one ranked prospect file.
// Reads engine/preview/national/cell-*.json (arrays of businesses),
// dedupes by normalized domain/name, sorts worst-first, writes prospects-national.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "preview", "national");
if (!fs.existsSync(DIR)) { console.log("no national/ dir yet"); process.exit(0); }

const norm = (u = "") => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

const all = [];
for (const f of fs.readdirSync(DIR)) {
  if (!f.startsWith("cell-") || !f.endsWith(".json")) continue;
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (Array.isArray(rows)) all.push(...rows);
  } catch (e) { console.error("skip", f, e.message); }
}

const seen = new Set();
const deduped = [];
for (const b of all) {
  const key = norm(b.url) || (b.name || "").toLowerCase().trim();
  if (!key || seen.has(key)) continue;
  seen.add(key);
  deduped.push(b);
}
deduped.sort((a, b) => (b.badnessScore || 0) - (a.badnessScore || 0));

const byVertical = {};
for (const b of deduped) byVertical[b.vertical || "?"] = (byVertical[b.vertical || "?"] || 0) + 1;

const out = { generated: "sweep wf_238114a2-59f (partial)", total: deduped.length, byVertical, prospects: deduped };
fs.writeFileSync(path.join(HERE, "preview", "prospects-national.json"), JSON.stringify(out, null, 2));
console.log(`merged ${all.length} rows -> ${deduped.length} unique prospects`);
console.log("byVertical:", JSON.stringify(byVertical));
console.log("\ntop 8 worst:");
for (const b of deduped.slice(0, 8)) console.log(`  ${b.badnessScore}  ${b.name} — ${b.url || b.webPresence || "no site"} (${b.city})`);
