// Stillness — "Stillness". Calm, contemplative. Sage + warm stone neutrals,
// Newsreader display, generous breath between sections. Fonts intentionally
// darkened (--mut/--stone/--sage) for readability — do not lighten.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Bespoke campus card — this design's anchor carries the `link subtle` class
// (no trailing arrow) rather than flagship's plain "Directions →".
function campusCards(campuses = []) {
  return campuses
    .map(
      (c) =>
        `\n      <div class="campus reveal"><h3>${esc(c.name)}</h3><div class="adr">${esc(c.note || "")}</div><div class="t">${esc(c.times || "")}</div><a class="link subtle" href="${esc(c.map || "#")}">Directions</a></div>`
    )
    .join("");
}

// Footer campus links point at the #gather section in this design.
function footerCampusLinks(campuses = []) {
  return campuses.map((c) => `<li><a href="#gather">${esc(c.name)}</a></li>`).join("");
}

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "stillness.tmpl.html"), "utf8");
  h = fillTokens(h, p);
  const hl = p.headline || { lead: "Come to me, all who are weary.", accent: "Find rest." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  if (p.announce)
    h = h.replace(/(<div class="announce">)[^<]*(<a )/, `$1${esc(p.announce)} $2`);
  if (p.lede)
    h = h.replace(/(<p class="lede">)[^<]*(<\/p>)/, `$1${esc(p.lede)}$2`);

  if (p.campuses?.length) {
    h = h.replace(
      /(<div class="campgrid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${campusCards(p.campuses)}\n    $2`
    );
    h = h.replace(/(<h4>Campuses<\/h4><ul>)[\s\S]*?(<\/ul>)/, `$1${footerCampusLinks(p.campuses)}$2`);
  }
  if (p.times?.length)
    h = h.replace(/(<li><b>Saturday<\/b>[\s\S]*?)(<\/ul>)/, `${build.timesList(p.times)}\n      $2`);
  if (p.events?.length)
    h = h.replace(
      /(<h2>Life together, on the calendar\.<\/h2>\s*<\/div>)[\s\S]*?(<\/div>\s*<\/section>)/,
      `$1${build.eventRows(p.events)}\n    $2`
    );
  if (p.story?.cite)
    h = h.replace(
      /(<section class="story reveal">[\s\S]*?<cite class="kicker">)[^<]*(<\/cite>)/,
      `$1${esc(p.story.cite)}$2`
    );

  return h;
}

export default { render };
