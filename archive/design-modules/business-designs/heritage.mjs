// Heritage Craft — oxblood + ochre + pine on aged parchment, Bevan + Spectral + Archivo.
// Warm, textured, artisan/vintage-modern. Fits barber, brewery, coffee, restaurant,
// cafe, tattoo, craft, bakery. Templatized from the hand-crafted Cherry Hills build;
// content is driven entirely by the profile. Designs are STYLE; the profile is CONTENT.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- design-specific inline glyphs (kept in this art direction's style) ----
const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const SVC_ICON = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 6l3.5 7 7.7 1.1-5.6 5.4 1.3 7.6L24 30.9l-6.9 3.2 1.3-7.6-5.6-5.4 7.7-1.1z"/><path d="M13 40h22"/></svg>`;
const STAR = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3 6.9 7.5.6-5.7 5 1.7 7.5L12 18.3 5.5 22l1.7-7.5L1.5 9.5 9 8.9z"/></svg>`;
const STARS5 = STAR.repeat(5);

// Replace everything between a pair of <!--NAME-START--> / <!--NAME-END--> markers.
function fillRegion(h, name, content) {
  return h.replace(new RegExp(`<!--${name}-START-->[\\s\\S]*?<!--${name}-END-->`), () => content);
}

// Bespoke builders — this design has its own class names, so we emit markup
// that matches THIS art direction rather than the generic _shared.build ones.
const heritage = {
  // services: [{name, desc}] — engraved "No. 0X" index + emblem + more link.
  serviceCards: (services, bookUrl) =>
    services.map((s, i) =>
      `\n      <article class="svc reveal" data-d="${(i % 3) + 1}">
        <span class="svc__no">No. ${String(i + 1).padStart(2, "0")}</span>
        <div class="svc__ico">${SVC_ICON}</div>
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.desc || "")}</p>
        <a class="svc__more" href="${esc(bookUrl)}">Learn more ${ARROW}</a>
      </article>`
    ).join("") + "\n    ",

  // reviews: [{quote, name, sub?}] — parchment card, initial avatar.
  reviewCards: (reviews) =>
    reviews.map((r, i) => {
      const initial = esc(String(r.name || "").trim().charAt(0).toUpperCase() || "★");
      const sub = esc(r.sub || r.role || r.location || "Verified review");
      return `\n      <figure class="rev reveal" data-d="${(i % 2) + 1}">
        <span class="rev__stars stars" role="img" aria-label="5 out of 5 stars">${STARS5}</span>
        <blockquote>${esc(r.quote)}</blockquote>
        <figcaption><span class="rev__ava" aria-hidden="true">${initial}</span><span class="rev__who"><b>${esc(r.name)}</b><span>${sub}</span></span></figcaption>
      </figure>`;
    }).join("") + "\n    ",

  // trust: ["Same-week appointments", ...] — first word is the big display
  // "number", the remainder is the muted label beneath it.
  trustItems: (trust) =>
    trust.map((t, i) => {
      const s = String(t).trim();
      const sp = s.indexOf(" ");
      const num = sp === -1 ? s : s.slice(0, sp);
      const label = sp === -1 ? "" : s.slice(sp + 1);
      return `\n    <div class="trust__cell reveal" data-d="${i + 1}"><span class="trust__num tnum">${esc(num)}</span><span class="trust__lab">${esc(label)}</span></div>`;
    }).join("") + "\n  ",

  // hours: [{label, time}] — first row is marked as "today".
  hoursList: (hours) =>
    hours.map((h, i) =>
      `\n          <div class="hours__row${i === 0 ? " is-today" : ""}"><span class="d">${esc(h.label)}</span><span class="t tnum">${esc(h.time)}</span></div>`
    ).join("") + "\n        ",

  // footer service links from the same services array.
  footServiceLinks: (services) =>
    services.map((s) => `\n          <li><a href="#services">${esc(s.name)}</a></li>`).join("") + "\n        ",

  // booking-form <select> options: offer first, then the services.
  selectOptions: (services, offerTitle) =>
    (offerTitle ? `\n              <option>${esc(offerTitle)}</option>` : "") +
    services.map((s) => `\n              <option>${esc(s.name)}</option>`).join("") + "\n            ",

  // team: [{name, role?}] — crew cards with monogram initials.
  teamCards: (team) =>
    team.map((m) => {
      const nm = String(m.name || "").trim();
      const mono = esc(nm.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase() || "•");
      const role = m.role ? `<span>${esc(m.role)}</span>` : "";
      return `\n      <figure class="crew__card">
        <span class="crew__mono">${mono}</span><b>${esc(nm)}</b>${role}
      </figure>`;
    }).join("") + "\n    ",
};

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "heritage.tmpl.html"), "utf8");

  // Scalar identity/content tokens (NAME, NAME_SHORT, LOCALE, TAGLINE, LEDE,
  // PHONE, RATING, REVIEW_COUNT, OFFER_*, EST, BOOK_URL) + <title> + hero image.
  h = fillTokens(h, p);

  // EST default — the seal & "Est." lines read "2003" unless the profile
  // supplies `founded` (fillTokens leaves {{EST}} empty when omitted).
  h = h.split("{{EST}}").join(esc(p.founded || "2003"));

  // Die-cut coupon keeps its small superscript currency mark: split the offer
  // price ("$100" -> "$" + "100") into OFFER_CUR + OFFER_NUM.
  const price = String(p.offer?.price || "");
  const m = price.match(/^(\D*)([\s\S]*)$/);
  h = h.split("{{OFFER_CUR}}").join(esc(m ? m[1] : "")).split("{{OFFER_NUM}}").join(esc(m ? m[2] : price));

  // Two-part hero headline: small italic swash lead + big Bevan display accent.
  // Design-specific default (the source's original), overridable via p.headline.
  const hl = p.headline || { lead: "Dentistry you'll actually", accent: "Look forward to going to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  const bookUrl = p.bookUrl || "#book";

  // Structural list blocks — regenerated from profile arrays.
  if (p.services?.length) {
    h = fillRegion(h, "SVC", heritage.serviceCards(p.services, bookUrl));
    h = fillRegion(h, "FOOTSVC", heritage.footServiceLinks(p.services));
    h = fillRegion(h, "SELECT", heritage.selectOptions(p.services, p.offer?.title));
  }
  if (p.reviews?.length) h = fillRegion(h, "REV", heritage.reviewCards(p.reviews));
  if (p.trust?.length) h = fillRegion(h, "TRUST", heritage.trustItems(p.trust));
  if (p.hours?.length) h = fillRegion(h, "HOURS", heritage.hoursList(p.hours));

  // Team teaser: fill when provided, otherwise drop the whole section.
  if (p.team?.length) {
    h = fillRegion(h, "TEAM", heritage.teamCards(p.team));
  } else {
    h = h.replace(/<!--TEAM-SECTION-START-->[\s\S]*?<!--TEAM-SECTION-END-->/, "");
  }

  // Drop any region markers left in place.
  h = h.replace(/<!--[A-Z-]+-(?:START|END)-->/g, "");

  // build is available from _shared for designs that use the generic markup;
  // this design ships bespoke builders above, so it is intentionally unused.
  void build;
  return h;
}

export default { render };
