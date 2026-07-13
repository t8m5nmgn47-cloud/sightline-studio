// Tech Precision — graphite + warm off-white + teal signal.
// Crisp, geometric, structured, data-viz-grade polish. Archivo + IBM Plex Sans + Mono.
// Fits agency, consulting, IT, SaaS, software, b2b, engineering, architecture, tech.
// Templatized from a hand-crafted "Tech Precision" build; content is driven
// entirely by the profile. Mirrors clinical.mjs / bold.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- design-specific inline glyphs (geometric line icons for svc cards) ----
const SVC_ICONS = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 4 8l8 4 8-4-8-4Z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M6 20v-6M12 20V6M18 20v-9"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 6H18M6 8.2V16a2 2 0 0 0 2 2h7.8"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 5 13h6l-1 8 8-11h-6l1-7Z"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/></svg>',
];

// two-letter initials from a person's name (strips honorifics)
function initials(name) {
  const clean = String(name || "").replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const s = parts.map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();
  return esc(s || "•");
}

// Replace everything between a pair of <!--NAME-START--> / <!--NAME-END--> markers.
function fillRegion(h, name, content) {
  return h.replace(new RegExp(`<!--${name}-START-->[\\s\\S]*?<!--${name}-END-->`), () => content);
}

// Bespoke builders emitting THIS design's class names / art direction.
const precision = {
  // services: [{name, desc}] -> geometric svc cards with cycled line icons
  serviceCards: (services) =>
    services.map((s, i) =>
      `\n      <article class="svc">
        <div class="svc__top">
          <span class="svc__ix">${String(i + 1).padStart(2, "0")}</span>
          <span class="svc__icon" aria-hidden="true">${SVC_ICONS[i % SVC_ICONS.length]}</span>
        </div>
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.desc || "")}</p>
        <span class="svc__link">Learn more →</span>
      </article>`
    ).join("") + "\n      ",

  // reviews: [{quote, name, sub?}] -> spec-card quotes, avatar alternates accent
  reviewCards: (reviews) =>
    reviews.map((r, i) => {
      const sub = r.sub ? `\n            <span class="rl">${esc(r.sub)}</span>` : "";
      const t2 = i % 2 === 1 ? " t2" : "";
      return `\n      <figure class="quote">
        <div class="mk" aria-hidden="true">"</div>
        <blockquote><p>${esc(r.quote)}</p></blockquote>
        <figcaption class="quote__by">
          <span class="avatar${t2}" aria-hidden="true">${initials(r.name)}</span>
          <span>
            <span class="nm">${esc(r.name)}</span>${sub}
          </span>
        </figcaption>
      </figure>`;
    }).join("") + "\n    ",

  // trust: ["20+ Years in practice", ...] -> big display number cells.
  // First token is the big display "number" (trailing +/★ split into a span),
  // the remainder is the mono label beneath it.
  trustItems: (trust) =>
    trust.map((t) => {
      const str = String(t).trim();
      const sp = str.indexOf(" ");
      const head = sp === -1 ? str : str.slice(0, sp);
      const label = sp === -1 ? "" : str.slice(sp + 1);
      const m = head.match(/^(.*?)([+★·]+)$/);
      const numHtml = m
        ? `${esc(m[1])}<span>${esc(m[2])}</span>`
        : esc(head);
      return `\n      <div class="trust__cell">
        <div class="trust__n tnum">${numHtml}</div>
        <div class="trust__l">${esc(label)}</div>
      </div>`;
    }).join("") + "\n    ",

  // hours: [{label, time}] -> rows, first row flagged "now"
  hoursRows: (hours) =>
    hours.map((h, i) =>
      `\n          <div class="hours__row${i === 0 ? " now" : ""}"><span class="hours__d">${esc(h.label)}</span><span class="hours__t tnum">${esc(h.time)}</span></div>`
    ).join("") + "\n        ",

  // footer service links from the services array
  footServiceLinks: (services) =>
    services.map((s) => `\n        <a href="#services">${esc(s.name)}</a>`).join(""),

  // offer.includes -> pill chips
  offerIncl: (items) =>
    items.map((x) => `<span>${esc(x)}</span>`).join("\n          "),

  // team: [{name, role?}] -> monogram member cards
  teamCards: (team) =>
    team.map((m) => {
      const role = m.role ? `<div class="member__rl">${esc(m.role)}</div>` : "";
      return `\n      <div class="member">
        <div class="member__ph"><span class="member__mono">${initials(m.name)}</span></div>
        <div class="member__nm">${esc(m.name)}</div>${role}
      </div>`;
    }).join("") + "\n    ",

  // form "what can we help with?" options: offer title first, then services
  selectOptions: (services, offerTitle) => {
    const opts = [];
    if (offerTitle) opts.push(offerTitle);
    services.forEach((s) => opts.push(s.name));
    if (!opts.length) opts.push("General enquiry");
    return opts.map((o) => `\n            <option>${esc(o)}</option>`).join("") + "\n          ";
  },
};

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "precision.tmpl.html"), "utf8");

  // Derived offer tokens: split the price into currency symbol + digits so the
  // giant "99" number and the "$" prefix both track the profile.
  const price = String(p.offer?.price || "");
  const symbol = (price.match(/^[^\d]*/) || [""])[0] || "$";
  const num = (price.match(/[\d.,]+/) || [""])[0] || "";
  const oldPrice = p.offer?.was || "";

  // Strip the strikethrough "was" price entirely when none is supplied,
  // and the "Est." hero-note fragment when there's no founding year.
  // (Done pre-fill so the {{...}} tokens inside them are removed too.)
  if (!oldPrice) h = h.replace(/<div class="price__was[^>]*>[\s\S]*?<\/div>\s*/, "");
  if (!p.founded) h = h.replace(/<span class="hero-est">[\s\S]*?<\/span>/, "");

  h = fillTokens(h, p);

  const customs = {
    OFFER_SYMBOL: symbol,
    OFFER_PRICE_NUM: num,
    OFFER_WAS: oldPrice,
  };
  for (const [k, v] of Object.entries(customs)) h = h.split(`{{${k}}}`).join(esc(v));

  // Hero display headline: design-specific default (the source's original),
  // overridable per business via p.headline = { lead, accent }.
  const hl = p.headline || { lead: "Dentistry you'll actually", accent: "look forward to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  const offerTitle = p.offer?.title || "";

  // Structural list blocks — regenerated from profile arrays.
  if (p.services?.length) {
    h = fillRegion(h, "SVC", precision.serviceCards(p.services));
    h = fillRegion(h, "FOOTSVC", precision.footServiceLinks(p.services));
    h = fillRegion(h, "SELECT", precision.selectOptions(p.services, offerTitle));
  }
  if (p.reviews?.length) h = fillRegion(h, "REV", precision.reviewCards(p.reviews));
  if (p.trust?.length) h = fillRegion(h, "TRUST", precision.trustItems(p.trust));
  if (p.hours?.length) h = fillRegion(h, "HOURS", precision.hoursRows(p.hours));
  if (p.offer?.includes?.length) h = fillRegion(h, "INCL", precision.offerIncl(p.offer.includes));

  // Team teaser: fill when provided, otherwise drop the whole section.
  if (p.team?.length) {
    h = fillRegion(h, "TEAM", precision.teamCards(p.team));
  } else {
    h = h.replace(/<!--TEAM-SECTION-START-->[\s\S]*?<!--TEAM-SECTION-END-->/, "");
  }

  // Drop any region markers that were left in place (default fallbacks).
  h = h.replace(/<!--[A-Z-]+-(?:START|END)-->/g, "");

  // build (generic _shared markup) unused — this design ships bespoke builders.
  void build;
  return h;
}

export default { render };
