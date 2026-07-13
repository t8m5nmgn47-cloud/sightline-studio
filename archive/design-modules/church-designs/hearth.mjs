// Hearth — warm, family, rounded community church.
// Poppins + Fraunces, cream + terracotta + forest green, pill buttons,
// scalloped hero edge, warm paper grain.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "hearth.tmpl.html"), "utf8");
  h = fillTokens(h, p);
  const hl = p.headline || { lead: "Pull up a chair.", accent: "room for you" };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  if (p.announce)
    h = h.replace(/(<div class="announce"><span class="dot"><\/span> )[^<]*(<a )/, `$1${esc(p.announce)} $2`);
  if (p.lede)
    h = h.replace(/(<p class="lede rise d3">)[^<]*(<\/p>)/, `$1${esc(p.lede)}$2`);

  if (p.campuses?.length) {
    h = h.replace(
      /(<section class="campuses"[\s\S]*?<div class="campgrid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${build.campusCards(p.campuses, "campus")}\n    $2`
    );
    h = h.replace(/(<h4>Campuses<\/h4><ul>)[\s\S]*?(<\/ul>)/, `$1${build.footerCampusLinks(p.campuses)}$2`);
  }
  if (p.times?.length)
    h = h.replace(/(<li><b>Saturday<\/b>[\s\S]*?)(<\/ul>)/, `${build.timesList(p.times)}\n      $2`);
  if (p.events?.length)
    h = h.replace(/(<div class="elist">)[\s\S]*?(\s*<\/div>\s*<\/div>\s*<\/section>)/, `$1${build.eventRows(p.events)}\n    $2`);
  if (p.story?.cite)
    h = h.replace(/(<cite>)—[^<]*(<\/cite>)/, `$1— ${esc(p.story.cite)}$2`);

  return h;
}

export default { render };
