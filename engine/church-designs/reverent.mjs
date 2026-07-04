// Reverent — sacred, symmetric, liturgical. Playfair Display, ivory + aubergine
// + gold, letterpress grain and gold rule motifs. A Catholic / traditional fit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Bespoke campus card — this design's markup has a gold .sep divider and a
// centered, uppercased "Directions" link (no arrow), unlike the flagship.
function campusCards(campuses = []) {
  return campuses
    .map(
      (c) =>
        `\n      <div class="campus reveal"><h3>${esc(c.name)}</h3><div class="sep" aria-hidden="true"></div><div class="adr">${esc(
          c.note || ""
        )}</div><div class="t">${esc(c.times || "")}</div><a href="${esc(c.map || "#")}">Directions</a></div>`
    )
    .join("");
}

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "reverent.tmpl.html"), "utf8");
  h = fillTokens(h, p);
  const hl = p.headline || { lead: "Come to me, all who are", accent: "weary." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  // Announce bar: text sits between the gold diamond and the trailing link.
  if (p.announce)
    h = h.replace(
      /(<div class="announce"><span class="dia" aria-hidden="true"><\/span> )[^<]*(<a )/,
      `$1${esc(p.announce)} $2`
    );

  // Hero lede sub-paragraph.
  if (p.lede)
    h = h.replace(/(<p class="lede rise d3">)[^<]*(<\/p>)/, `$1${esc(p.lede)}$2`);

  // Campus cards + footer campus links.
  if (p.campuses?.length) {
    h = h.replace(
      /(<section class="campuses"[\s\S]*?<div class="campgrid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${campusCards(p.campuses)}\n    $2`
    );
    h = h.replace(/(<h4>Campuses<\/h4><ul>)[\s\S]*?(<\/ul>)/, `$1${build.footerCampusLinks(p.campuses)}$2`);
  }

  // Service / Mass times list (shares the flagship's <li><b>label</b><span>time</span> shape).
  if (p.times?.length)
    h = h.replace(/(<li><b>Saturday<\/b>[\s\S]*?)(<\/ul>)/, `${build.timesList(p.times)}\n      $2`);

  // Upcoming events rows (.elist / .erow / .go — same shape as the flagship builder).
  if (p.events?.length)
    h = h.replace(
      /(<div class="elist">)[\s\S]*?(\s*<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${build.eventRows(p.events)}\n    $2`
    );

  // Testimonial attribution — this design prefixes with an em-dash entity.
  if (p.story?.cite)
    h = h.replace(/(<cite>)&mdash;[^<]*(<\/cite>)/, `$1&mdash; ${esc(p.story.cite)}$2`);

  return h;
}

export default { render };
