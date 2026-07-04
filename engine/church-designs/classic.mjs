// Chapel Classic — "Established". Navy + burgundy + gold, crest, EST. heritage.
// Cormorant Garamond + Inter, symmetric masthead layout over a real photo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// This design's times list has a decorative dotted leader (.lead) between the
// label and the time, so it needs its own builder rather than build.timesList.
const timesListClassic = (times = []) =>
  times
    .map(
      (t) =>
        `<li><b>${esc(t.label)}</b><span class="lead" aria-hidden="true"></span><span>${esc(t.time)}</span></li>`
    )
    .join("\n        ");

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "classic.tmpl.html"), "utf8");
  h = fillTokens(h, p);
  const hl = p.headline || { lead: "Come as you are.", accent: "Be made new." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));
  // Heritage founding year (own token; not handled by fillTokens).
  h = h.split("{{EST}}").join(esc(p.founded || "1971"));

  if (p.announce)
    h = h.replace(/(<div class="announce"><span class="dmd"><\/span> )[^<]*(<a )/, `$1${esc(p.announce)} $2`);
  if (p.lede)
    h = h.replace(/(<p class="lede rise d3">)[^<]*(<\/p>)/, `$1${esc(p.lede)}$2`);

  if (p.campuses?.length) {
    h = h.replace(
      /(<div class="campgrid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${build.campusCards(p.campuses, "campus")}\n    $2`
    );
    h = h.replace(/(<h4>Campuses<\/h4><ul>)[\s\S]*?(<\/ul>)/, `$1${build.footerCampusLinks(p.campuses)}$2`);
  }
  if (p.times?.length)
    h = h.replace(
      /(<section class="times"[\s\S]*?<ul>)[\s\S]*?(<\/ul>)/,
      `$1\n        ${timesListClassic(p.times)}\n      $2`
    );
  if (p.events?.length)
    h = h.replace(/(<div class="elist">)[\s\S]*?(\s*<\/div>\s*<\/div>\s*<\/section>)/, `$1${build.eventRows(p.events, "erow")}\n    $2`);
  if (p.story?.cite)
    h = h.replace(/(<section class="story">[\s\S]*?<cite>)[^<]*(<\/cite>)/, `$1${esc(p.story.cite)}$2`);

  return h;
}

export default { render };
