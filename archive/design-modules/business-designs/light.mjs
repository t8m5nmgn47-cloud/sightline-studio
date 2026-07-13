// Fresh Light — bright mint-white ground, deep-spruce ink, one crisp coral accent.
// Bricolage Grotesque + Hanken Grotesk + Newsreader italic. Airy, approachable-premium.
// Fits optometry, family clinics, chiropractic, dietitian, general clinic.
// Templatized from the hand-crafted Cherry Hills sample; content is driven
// entirely by the profile. Mirrors clinical.mjs / warm.mjs / bold.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- design-specific inline glyphs (kept identical to the source art) ----
const SVC_ICON = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.2 5.5L20 9l-4 3.9L17 19l-5-3-5 3 1-6.1L4 9l5.8-.5z"/></svg>`;
const ARROW = `<svg class="arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M7 7h10v10"/></svg>`;

// Avatar gradients from the source review cards (coral / spruce), alternated.
const AV_GRAD = ["linear-gradient(140deg,#FF6A4D,#E8492C)", "linear-gradient(140deg,#1C4A42,#0E2A26)"];

// initials from a name — up to `n` leading letters of the first words.
const initials = (name, n = 2) =>
  (String(name || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, n).toUpperCase()) || "★";

// Replace everything between a pair of <!--NAME-START--> / <!--NAME-END--> markers.
function fillRegion(h, name, content) {
  return h.replace(new RegExp(`<!--${name}-START-->[\\s\\S]*?<!--${name}-END-->`), () => content);
}

// Bespoke builders — this design has its own class names, so we emit markup
// that matches THIS art direction rather than the generic _shared.build ones.
const light = {
  // services: [{name, desc}] — grid CSS makes the first two cards the wide tiles.
  serviceCards: (services) =>
    services.map((s, i) =>
      `\n      <article class="svc reveal" data-delay="${(i % 3) + 1}">
        <div class="svc-ic">${SVC_ICON}</div>
        ${ARROW}
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.desc || "")}</p>
      </article>`
    ).join("") + "\n    ",

  // reviews: [{quote, name, sub?}]
  reviewCards: (reviews) =>
    reviews.map((r, i) => {
      const sub = r.sub ? `<span>${esc(r.sub)}</span>` : "";
      return `\n      <blockquote class="review reveal" data-delay="${(i % 2) + 1}">
        <span class="stars" aria-label="5 out of 5 stars">★★★★★</span>
        <blockquote>“${esc(r.quote)}”</blockquote>
        <div class="who">
          <span class="av" style="background:${AV_GRAD[i % AV_GRAD.length]};">${esc(initials(r.name))}</span>
          <div><b>${esc(r.name)}</b>${sub}</div>
        </div>
      </blockquote>`;
    }).join("") + "\n    ",

  // trust: ["20+ years serving", ...] — first word is the big display "number",
  // the remainder is the muted label beneath it.
  trustItems: (trust) =>
    trust.map((t) => {
      const s = String(t).trim();
      const sp = s.indexOf(" ");
      const num = sp === -1 ? s : s.slice(0, sp);
      const label = sp === -1 ? "" : s.slice(sp + 1);
      return `\n    <div class="trust-cell"><div class="num tnum">${esc(num)}</div><div class="lbl">${esc(label)}</div></div>`;
    }).join("") + "\n  ",

  // hours: [{label, time}] — first row is marked as "today".
  hoursList: (hours) =>
    hours.map((h, i) =>
      `\n        <div class="hours-row${i === 0 ? " today" : ""}"><span class="day">${esc(h.label)}</span><span class="time tnum">${esc(h.time)}</span></div>`
    ).join("") + "\n        ",

  // team: [{name, role?, bio?}]
  teamCards: (team) =>
    team.map((m, i) => {
      const role = m.role ? `<div class="role">${esc(m.role)}</div>` : "";
      const bio = m.bio ? `<p>${esc(m.bio)}</p>` : "";
      return `\n      <figure class="member reveal" data-delay="${(i % 3) + 1}" style="margin:0;">
        <div class="ph"><span class="initial">${esc(initials(m.name, 3))}</span></div>
        <figcaption class="body"><h4>${esc(m.name)}</h4>${role}${bio}</figcaption>
      </figure>`;
    }).join("") + "\n    ",

  // footer service links from the same services array.
  footServiceLinks: (services) =>
    services.map((s) => `\n        <a href="#services">${esc(s.name)}</a>`).join("") + "\n      ",
};

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "light.tmpl.html"), "utf8");

  // The hero card's "Community since" year defaults to the source's founding
  // year when the profile doesn't supply one.
  const prof = { ...p, founded: p.founded || "2003" };
  h = fillTokens(h, prof);

  // The big price tile splits the "$" (static) from the numeric amount, so
  // strip any leading currency symbol from OFFER_PRICE for that slot.
  const priceNum = String(p.offer?.price || "$99").replace(/^[^\d]*/, "") || "99";
  h = h.split("{{OFFER_PRICE_NUM}}").join(esc(priceNum));

  // Hero display headline: design-specific default (the source's original),
  // overridable per business via p.headline = { lead, accent }. The accent is
  // rendered in the Newsreader-italic coral .em span.
  const hl = p.headline || { lead: "Dentistry you'll", accent: "actually look forward to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  // Structural list blocks — regenerated from profile arrays.
  if (p.services?.length) {
    h = fillRegion(h, "SVC", light.serviceCards(p.services));
    h = fillRegion(h, "FOOTSVC", light.footServiceLinks(p.services));
  }
  if (p.reviews?.length) h = fillRegion(h, "REV", light.reviewCards(p.reviews));
  if (p.trust?.length) h = fillRegion(h, "TRUST", light.trustItems(p.trust));
  if (p.hours?.length) h = fillRegion(h, "HOURS", light.hoursList(p.hours));

  // Team teaser: fill when provided, otherwise drop the whole section.
  if (p.team?.length) {
    h = fillRegion(h, "TEAM", light.teamCards(p.team));
  } else {
    h = h.replace(/<!--TEAM-SECTION-START-->[\s\S]*?<!--TEAM-SECTION-END-->/, "");
  }

  // Drop any region markers that were left in place.
  h = h.replace(/<!--[A-Z-]+-(?:START|END)-->/g, "");

  // build is available from _shared for designs that use the generic markup;
  // this design ships bespoke builders above, so it is intentionally unused.
  void build;
  return h;
}

export default { render };
