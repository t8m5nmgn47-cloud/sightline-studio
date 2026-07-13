// Clinical Calm — petrol-teal jewel-tone, Newsreader + Instrument Sans.
// Serene, premium-medical. Fits dental, medical, obgyn, dermatology, optometry, ENT.
// Templatized from the hand-crafted Cherry Hills Dentistry build; content is
// driven entirely by the profile. Mirrors engine/church-designs/flagship.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- design-specific inline glyphs (kept identical to the source art) ----
const ARROW = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVC_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l2.1 4.6 5 .5-3.7 3.4 1 4.9L12 14.9 7.6 16.9l1-4.9L4.9 8.6l5-.5L12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const CHK = `<span class="chk"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const AVATAR = `<svg viewBox="0 0 200 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="200" height="250" fill="#d7e5e0"/><circle cx="100" cy="95" r="42" fill="#b7cdc6"/><path d="M40 250c0-40 27-66 60-66s60 26 60 66" fill="#b7cdc6"/></svg>`;

// Replace everything between a pair of <!--NAME-START--> / <!--NAME-END--> markers.
function fillRegion(h, name, content) {
  return h.replace(new RegExp(`<!--${name}-START-->[\\s\\S]*?<!--${name}-END-->`), () => content);
}

// Bespoke builders — this design has its own class names, so we emit markup
// that matches THIS art direction rather than the generic _shared.build ones.
const clinical = {
  // services: [{name, desc}] — first card renders as the wide feature tile.
  serviceCards: (services, bookUrl) =>
    services.map((s, i) => {
      const feature = i === 0 ? " feature" : "";
      return `\n      <article class="svc${feature} reveal" data-d="${(i % 3) + 1}">
        <div class="svc-ico">${SVC_ICON}</div>
        <h3>${esc(s.name)}</h3>
        <p class="svc-desc">${esc(s.desc || "")}</p>
        <a class="svc-more" href="${esc(bookUrl)}">Learn more ${ARROW}</a>
      </article>`;
    }).join("") + "\n    ",

  // reviews: [{quote, name, sub?}]
  reviewCards: (reviews) =>
    reviews.map((r, i) => {
      const initial = esc(String(r.name || "").trim().charAt(0) || "★");
      const sub = r.sub ? `<div class="sub">${esc(r.sub)}</div>` : "";
      return `\n      <blockquote class="rev reveal" data-d="${(i % 2) + 1}">
        <span class="stars" aria-hidden="true">★★★★★</span>
        <p class="quote">“${esc(r.quote)}”</p>
        <div class="who"><span class="av" aria-hidden="true">${initial}</span><div><div class="nm">${esc(r.name)}</div>${sub}</div></div>
      </blockquote>`;
    }).join("") + "\n    ",

  // trust: ["Physician-led", "10,000+ treatments", ...] — first word is the
  // big display "number", the remainder is the muted label beneath it.
  trustItems: (trust) =>
    trust.map((t, i) => {
      const s = String(t).trim();
      const sp = s.indexOf(" ");
      const num = sp === -1 ? s : s.slice(0, sp);
      const label = sp === -1 ? "" : s.slice(sp + 1);
      return `\n      <div class="trust-item reveal" data-d="${i + 1}"><span class="trust-num tnum">${esc(num)}</span><span class="trust-label">${esc(label)}</span></div>`;
    }).join("") + "\n    ",

  // hours: [{label, time}] — first row is marked as "today".
  hoursList: (hours) =>
    hours.map((h, i) =>
      `\n          <li${i === 0 ? ' class="today"' : ""}><span class="day">${esc(h.label)}</span><span class="hrs">${esc(h.time)}</span></li>`
    ).join("") + "\n        ",

  // offer.includes: ["...", ...] — the checkmark inclusions list.
  offerIncl: (items) =>
    items.map((x) => `<li>${CHK}${esc(x)}</li>`).join("\n          "),

  // footer service links from the same services array.
  footServiceLinks: (services) =>
    services.map((s) => `\n        <a href="#services">${esc(s.name)}</a>`).join(""),

  // team: [{name, role?, bio?}]
  teamCards: (team) =>
    team.map((m, i) => {
      const role = m.role ? `<div class="role">${esc(m.role)}</div>` : "";
      const bio = m.bio ? `<p class="bio">${esc(m.bio)}</p>` : "";
      return `\n      <article class="member reveal" data-d="${(i % 3) + 1}">
        <div class="por"><div class="photo-slot" role="img"></div>${AVATAR}</div>
        <div class="cap"><div class="nm">${esc(m.name)}</div>${role}${bio}</div>
      </article>`;
    }).join("") + "\n    ",
};

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "clinical.tmpl.html"), "utf8");
  h = fillTokens(h, p);

  // Hero display headline: design-specific default (the source's original),
  // overridable per business via p.headline = { lead, accent }.
  const hl = p.headline || { lead: "Dentistry you'll actually", accent: "look forward to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  const bookUrl = p.bookUrl || "#book";

  // Structural list blocks — regenerated from profile arrays.
  if (p.services?.length) {
    h = fillRegion(h, "SVC", clinical.serviceCards(p.services, bookUrl));
    h = fillRegion(h, "FOOTSVC", clinical.footServiceLinks(p.services));
  }
  if (p.reviews?.length) h = fillRegion(h, "REV", clinical.reviewCards(p.reviews));
  if (p.trust?.length) h = fillRegion(h, "TRUST", clinical.trustItems(p.trust));
  if (p.hours?.length) h = fillRegion(h, "HOURS", clinical.hoursList(p.hours));
  if (p.offer?.includes?.length) h = fillRegion(h, "INCL", clinical.offerIncl(p.offer.includes));

  // Team teaser: fill when provided, otherwise drop the whole section.
  if (p.team?.length) {
    h = fillRegion(h, "TEAM", clinical.teamCards(p.team));
  } else {
    h = h.replace(/<!--TEAM-SECTION-START-->[\s\S]*?<!--TEAM-SECTION-END-->/, "");
  }

  // Drop any region markers that were left in place (e.g. the offer inclusions
  // default list when no p.offer.includes was supplied).
  h = h.replace(/<!--[A-Z-]+-(?:START|END)-->/g, "");

  // build is available from _shared for designs that use the generic markup;
  // this design ships bespoke builders above, so it is intentionally unused.
  void build;
  return h;
}

export default { render };
