// Bold Modern — energetic, high-contrast, grid-breaking.
// Near-black plum + vermilion/volt/mint, Bricolage Grotesque + Archivo.
// Data-driven render module; mirrors the church flagship module split.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --- Bespoke block builders (match THIS design's class names) ------------

// Service icon pool + grid-breaking layout pattern, cycled by index so a
// variable-length services array reproduces the hand-crafted rhythm.
const SVC_ICONS = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 4c-2 0-2.8 1-4 1s-1.8-.5-2.6.3C4 6.8 4.8 10 6 13.5c.6 1.8 1 3.5 2 3.5s1-2 2-2 1 2 2 2 1.4-1.7 2-3.5c1.2-3.5 2-6.7.6-8.2C15.8 4.5 15.2 5 14 5s-2-1-2-1Z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m12 2 2.4 5 5.5.8-4 3.9.95 5.5L12 20l-4.85 2.6.95-5.5-4-3.9 5.5-.8Z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3v18M8 7h8M9 11h6M10 15h4"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 12a8 8 0 0 1 16 0M7 12h10M9 16h6"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M13 2 4 13h6l-1 9 9-11h-6z"/></svg>',
];
const SVC_LAYOUT = ["", "svc--feature", "", "svc--wide", "svc--wide"];
const AV_BG = [
  "linear-gradient(135deg,var(--vermilion),var(--vermilion-d))",
  "linear-gradient(135deg,var(--volt),#1a2fb0)",
];
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>';

const build = {
  // services: [{name, desc}] -> grid-breaking svc cards with cycled icons/layout
  serviceCards: (services = []) =>
    services
      .map((x, i) => {
        const extra = SVC_LAYOUT[i % SVC_LAYOUT.length];
        const cls = "svc" + (extra ? ` ${extra}` : "");
        const d = (i % 3) + 1;
        return `\n      <article class="${cls} reveal" data-d="${d}">
        <span class="svc__num">${String(i + 1).padStart(2, "0")}</span>
        <span class="svc__ic" aria-hidden="true">${SVC_ICONS[i % SVC_ICONS.length]}</span>
        <h3>${esc(x.name)}</h3>
        <p>${esc(x.desc || "")}</p>
      </article>`;
      })
      .join("") + "\n      ",

  // reviews: [{quote, name, role?}] -> quote cards, avatar initial + alt gradient
  quoteCards: (reviews = []) =>
    reviews
      .map((r, i) => {
        const init = esc(String(r.name || "?").trim().charAt(0).toUpperCase());
        const role = r.role ? `<span>${esc(r.role)}</span>` : "";
        return `\n      <figure class="quote reveal" data-d="${(i % 2) + 1}">
        <div class="quote__stars" aria-label="5 out of 5 stars">★★★★★</div>
        <div class="mark" aria-hidden="true">&ldquo;</div>
        <blockquote><p>${esc(r.quote)}</p></blockquote>
        <figcaption class="quote__by">
          <span class="quote__av" style="background:${AV_BG[i % AV_BG.length]}" aria-hidden="true">${init}</span>
          <span><b>${esc(r.name)}</b>${role}</span>
        </figcaption>
      </figure>`;
      })
      .join("") + "\n      ",

  // hours: [{label, time}] -> rows, first row flagged open
  hoursRows: (hours = []) =>
    hours
      .map(
        (h, i) =>
          `\n        <div class="hours__row${i === 0 ? " is-open" : ""}"><span class="d">${esc(h.label)}</span><span class="t tnum">${esc(h.time)}</span></div>`
      )
      .join("") + "\n        ",

  // trust: ["Same-week appointments", ...] -> ONE marquee row, duplicated
  // (the CSS animation needs two identical rows to loop seamlessly)
  marquee: (trust = []) => {
    const items = trust
      .map((t) => `<span class="marquee__item">${CHECK}${esc(t)} <i>•</i></span>`)
      .join("");
    const row = `<div class="marquee__row">${items}</div>`;
    return `\n    ${row}\n    ${row}\n    `;
  },

  // offer includes: ["...", ...] -> checklist items
  offerList: (items = []) =>
    items.map((t) => `\n          <li>${CHECK}${esc(t)}</li>`).join("") + "\n          ",

  // footer service links
  footerServiceLinks: (services = []) =>
    services.map((x) => `\n          <li><a href="#services">${esc(x.name)}</a></li>`).join("") + "\n          ",

  // team: [{name, role}] -> tcards, cycled color variant + initials
  teamCards: (team = []) =>
    team
      .map((m, i) => {
        const variant = (i % 3) + 1;
        const init = esc(
          String(m.name || "")
            .replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "")
            .split(/\s+/)
            .map((w) => w.charAt(0))
            .join("")
            .slice(0, 2)
            .toUpperCase() || "•"
        );
        return `\n      <article class="tcard tcard--${variant} reveal" data-d="${variant}">
        <span class="init" aria-hidden="true">${init}</span>
        <h4>${esc(m.name)}</h4>
        <span>${esc(m.role || "")}</span>
      </article>`;
      })
      .join("") + "\n      ",
};

// replace the inner content between paired <!--BOLD:KEY-->...<!--/BOLD:KEY--> markers
function fillRegion(html, key, inner) {
  const re = new RegExp(`<!--BOLD:${key}-->[\\s\\S]*?<!--/BOLD:${key}-->`);
  return html.replace(re, `<!--BOLD:${key}-->${inner}<!--/BOLD:${key}-->`);
}

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "bold.tmpl.html"), "utf8");
  h = fillTokens(h, p);

  // hero two-part headline: plain lead + vermilion/gradient-underline accent
  const hl = p.headline || { lead: "Dentistry you'll", accent: "look forward to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  // derived offer tokens: split the price into currency symbol + digits so the
  // giant "99" watermark and the <sup>$</sup>99 markup both track the profile.
  const price = String(p.offer?.price || "");
  const symbol = (price.match(/^[^\d]*/) || [""])[0] || "$";
  const num = (price.match(/[\d.,]+/) || [""])[0] || "";
  const kicker = p.offer?.kicker || "New patient special";
  const oldPrice = p.offer?.was || "";

  // brand sub-label: trailing words of the full name after the short name,
  // else the vertical, else empty.
  let sub = "";
  if (p.name && p.nameShort && p.name.startsWith(p.nameShort))
    sub = p.name.slice(p.nameShort.length).trim();
  if (!sub) sub = p.vertical ? p.vertical[0].toUpperCase() + p.vertical.slice(1) : "";

  const customs = {
    OFFER_SYMBOL: symbol,
    OFFER_PRICE_NUM: num,
    OFFER_KICKER: kicker,
    OFFER_OLD: oldPrice,
    NAME_SUB: sub,
  };
  for (const [k, v] of Object.entries(customs)) h = h.split(`{{${k}}}`).join(esc(v));

  // drop the strikethrough "was" price entirely when none is supplied
  h = h.replace(/<span class="tk-old">\s*<\/span>/, "");

  // regenerate data-driven blocks from profile arrays
  if (p.services?.length) {
    h = fillRegion(h, "SVC", build.serviceCards(p.services));
    h = fillRegion(h, "FOOTER_SVC", build.footerServiceLinks(p.services));
  }
  if (p.reviews?.length) h = fillRegion(h, "QUOTES", build.quoteCards(p.reviews));
  if (p.hours?.length) h = fillRegion(h, "HOURS", build.hoursRows(p.hours));
  if (p.trust?.length) h = fillRegion(h, "MARQUEE", build.marquee(p.trust));
  if (p.offer?.includes?.length) h = fillRegion(h, "OFFER_LIST", build.offerList(p.offer.includes));
  if (p.team?.length) h = fillRegion(h, "TEAM", build.teamCards(p.team));

  return h;
}

export default { render };
