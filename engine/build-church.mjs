#!/usr/bin/env node
// Build a church demo from a profile, in one design or all six.
//
//   node engine/build-church.mjs <profile.json> [design|all] [outDir]
//
// - design omitted or "auto"  -> recommendDesign() picks the best fit
// - design "all"              -> renders all six + a sales gallery switcher
// - default outDir            -> demos/<slug>/
//
// "all" mode writes demos/<slug>/<design>.html for each look plus an
// index.html that lets a prospect flip between the six directions live —
// the sales artifact for "here are six looks, pick yours."

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESIGNS, recommendDesign, renderChurch } from "./church-designs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

function galleryPage(profile, designs) {
  const first = designs[0];
  const btns = designs.map((d, i) =>
    `<button class="look${i === 0 ? " on" : ""}" data-d="${d}" onclick="pick('${d}')"><b>${DESIGNS[d].label}</b><span>${DESIGNS[d].vibe}</span></button>`
  ).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${profile.nameFull || profile.name} — choose your look · Sightline</title>
<style>
  *{box-sizing:border-box;margin:0}
  body{font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0e1116;color:#e8eaed}
  header{padding:14px 20px;display:flex;align-items:center;gap:18px;border-bottom:1px solid #232833;position:sticky;top:0;background:#0e1116;z-index:5}
  header h1{font-size:15px;font-weight:600;letter-spacing:.2px}
  header .sl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7c8698;margin-left:auto}
  .looks{display:flex;gap:8px;overflow-x:auto;padding:12px 20px;border-bottom:1px solid #232833;background:#11151c}
  .look{flex:0 0 auto;text-align:left;padding:9px 14px;border:1px solid #2a3040;border-radius:10px;background:#161b24;color:#c6ccd6;cursor:pointer;transition:.15s;min-width:150px}
  .look:hover{border-color:#3a68ff;background:#19202c}
  .look.on{border-color:#3a68ff;background:#19243a;color:#fff;box-shadow:0 0 0 1px #3a68ff inset}
  .look b{display:block;font-size:13px;font-weight:650}
  .look span{display:block;font-size:11px;color:#8892a4;margin-top:2px}
  .frame{position:absolute;inset:0;top:0;height:100%}
  main{position:relative;height:calc(100vh - 118px)}
  iframe{width:100%;height:100%;border:0;background:#fff}
</style></head><body>
<header><h1>${profile.nameFull || profile.name}</h1><span class="sl">Sightline · pick a direction</span></header>
<nav class="looks">${btns}</nav>
<main><iframe id="f" src="./${first}.html" title="preview"></iframe></main>
<script>
  function pick(d){
    document.getElementById('f').src='./'+d+'.html';
    document.querySelectorAll('.look').forEach(b=>b.classList.toggle('on',b.dataset.d===d));
  }
</script></body></html>`;
}

async function main() {
  const [profArg, designArg = "auto", outArg] = process.argv.slice(2);
  if (!profArg) { console.error("usage: node engine/build-church.mjs <profile.json> [design|all|auto] [outDir]"); process.exit(1); }

  const profile = JSON.parse(fs.readFileSync(profArg, "utf8"));
  const slug = profile.slug || (profile.name || "church").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const outDir = outArg || path.join(ROOT, "demos", slug);
  fs.mkdirSync(outDir, { recursive: true });

  let designs;
  if (designArg === "all") designs = Object.keys(DESIGNS);
  else if (designArg === "auto") designs = [recommendDesign(profile)];
  else designs = [designArg];

  for (const d of designs) {
    const html = await renderChurch(profile, d);
    fs.writeFileSync(path.join(outDir, `${d}.html`), html);
    console.log(`  ✓ ${d}.html`);
  }

  if (designArg === "all") {
    fs.writeFileSync(path.join(outDir, "index.html"), galleryPage(profile, designs));
    console.log(`  ✓ index.html (6-look gallery)`);
  } else {
    // single-design demo: index.html IS the site
    fs.copyFileSync(path.join(outDir, `${designs[0]}.html`), path.join(outDir, "index.html"));
    console.log(`  ✓ index.html (${designs[0]}${designArg === "auto" ? ", auto-matched" : ""})`);
  }
  console.log(`\n${profile.name}: built ${designs.length} design(s) → ${path.relative(ROOT, outDir)}/`);
}
main();
