// Grounded — charcoal-steel + utility-blue + safety-amber, Zilla Slab + IBM Plex Sans.
// Sturdy, dependable, "licensed & insured, built to last." Fits trades and home
// services: hvac, plumbing, roofing, electrical, landscaping, contractors, garage.
// Templatized from the hand-crafted Cherry Hills "Grounded" build; content is
// driven entirely by the profile. Mirrors clinical.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- design-specific inline glyphs (kept identical to the source art) ----
const ARROW = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVC_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-1.4-1.4 2.6-2.6a4 4 0 0 0-1.6.4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const CHK = `<span class="chk"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const CHIP_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// steel/concrete portrait placeholder, matched to this design's cool-neutral palette
const AVATAR = `<svg viewBox="0 0 200 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="200" height="250" fill="#d3dcd6"/><circle cx="100" cy="94" r="42" fill="#aebbb3"/><path d="M38 250c0-42 28-68 62-68s62 26 62 68" fill="#aebbb3"/></svg>`;

// Replace everything between a pair of <!--NAME-START--> / <!--NAME-END--> markers.
function fillRegion(h, name, content) {
  return h.replace(new RegExp(`<!--${name}-START-->[\\s\\S]*?<!--${name}-END-->`), () => content);
}

// Bespoke builders — this design has its own class names, so we emit markup
// that matches THIS art direction rather than the generic _shared.build ones.
const grounded = {
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

  // trust: ["Same week appointments", "500+ reviews", ...] — first word is the
  // big display "number/word", the remainder is the muted label beneath it.
  trustItems: (trust) =>
    trust.map((t, i) => {
      const s = String(t).trim();
      const sp = s.indexOf(" ");
      const num = sp === -1 ? s : s.slice(0, sp);
      const label = sp === -1 ? "" : s.slice(sp + 1);
      return `\n      <div class="trust-item reveal" data-d="${i + 1}"><span class="trust-num tnum">${esc(num)}</span><span class="trust-label">${esc(label)}</span></div>`;
    }).join("") + "\n    ",

  // credentials: ["Licensed & insured", "Bonded", ...] — the steel chip row,
  // each chip separated by a hairline divider.
  chipRow: (creds) =>
    creds.map((c) => `<span class="chip">${CHIP_ICON}${esc(c)}</span>`)
      .join('\n      <span class="chip-sep" aria-hidden="true"></span>\n      '),

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

  // team: [{name, role?, bio?, tag?}]
  teamCards: (team) =>
    team.map((m, i) => {
      const role = m.role ? `<div class="role">${esc(m.role)}</div>` : "";
      const bio = m.bio ? `<p class="bio">${esc(m.bio)}</p>` : "";
      const tag = m.tag ? `\n          <span class="tag">${esc(m.tag)}</span>` : "";
      return `\n      <article class="member reveal" data-d="${(i % 3) + 1}">
        <div class="por"><div class="photo-slot" role="img"></div>${AVATAR}${tag}
        </div>
        <div class="cap"><div class="nm">${esc(m.name)}</div>${role}${bio}</div>
      </article>`;
    }).join("") + "\n    ",
};

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "grounded.tmpl.html"), "utf8");

  // Signature "credential plate" values, resolved before the generic token pass.
  // EST/YEARS derive from p.founded (default 2004). The license line has no
  // profile field of its own — fill it from p.license with a generic default.
  const founded = Number(p.founded) || 2004;
  const years = Math.max(1, Math.floor((new Date().getFullYear() - founded) / 5) * 5) || 1;
  const license = p.license || "Licensed & Insured";
  // Fill EST here (not via scalarTokens) so the 2004 default survives when
  // p.founded is unset — fillTokens would otherwise blank {{EST}} to "".
  h = h.split("{{EST}}").join(esc(String(founded)));
  h = h.split("{{YEARS}}").join(esc(String(years)));
  h = h.split("{{LICENSE}}").join(esc(license));

  h = fillTokens(h, p);

  // Hero display headline: design-specific default (the source's original),
  // overridable per business via p.headline = { lead, accent }.
  const hl = p.headline || { lead: "Dentistry done right —", accent: "and done on time." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  const bookUrl = p.bookUrl || "#book";

  // Structural list blocks — regenerated from profile arrays.
  if (p.services?.length) {
    h = fillRegion(h, "SVC", grounded.serviceCards(p.services, bookUrl));
    h = fillRegion(h, "FOOTSVC", grounded.footServiceLinks(p.services));
  }
  if (p.reviews?.length) h = fillRegion(h, "REV", grounded.reviewCards(p.reviews));
  if (p.trust?.length) h = fillRegion(h, "TRUST", grounded.trustItems(p.trust));
  if (p.hours?.length) h = fillRegion(h, "HOURS", grounded.hoursList(p.hours));
  if (p.offer?.includes?.length) h = fillRegion(h, "INCL", grounded.offerIncl(p.offer.includes));

  // Credential chips: from p.credentials, else a generic, non-vertical default.
  const creds = p.credentials?.length
    ? p.credentials
    : ["Licensed & insured", "Fully bonded", "Background-checked crews", "Satisfaction guaranteed"];
  h = fillRegion(h, "CHIPS", grounded.chipRow(creds));

  // Team teaser: fill when provided, otherwise drop the whole section.
  if (p.team?.length) {
    h = fillRegion(h, "TEAM", grounded.teamCards(p.team));
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
