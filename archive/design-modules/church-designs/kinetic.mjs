// Kinetic — "Real. Messy. New." Bold, young/urban church-plant energy.
// Space Grotesk + Inter, dark ink background, acid-lime (#ccff33) outlined
// type, scrolling marquees. Mirrors flagship.mjs's render contract.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "kinetic.tmpl.html"), "utf8");
  h = fillTokens(h, p);
  const hl = p.headline || { lead: "Come as you are.", accent: "Be made new." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  // Announce ticker — duplicated span keeps the marquee seamless while scrolling.
  if (p.announce) {
    const span = `<span>◆ ${esc(p.announce)} <a href="#visit">PLAN YOUR VISIT →</a></span>`;
    h = h.replace(
      /(<div class="tk">)[\s\S]*?(<\/div>)/,
      `$1\n    ${span}\n    ${span}\n  $2`
    );
  }

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
    h = h.replace(/(<ul class="reveal">)[\s\S]*?(<\/ul>)/, `$1\n      ${build.timesList(p.times)}\n    $2`);
  if (p.events?.length)
    h = h.replace(/(<div class="elist">)[\s\S]*?(\s*<\/div>\s*<\/div>\s*<\/section>)/, `$1${build.eventRows(p.events)}\n    $2`);
  if (p.story?.cite)
    h = h.replace(/(<cite>)—[^<]*(<\/cite>)/, `$1— ${esc(p.story.cite)}$2`);

  return h;
}

export default { render };
