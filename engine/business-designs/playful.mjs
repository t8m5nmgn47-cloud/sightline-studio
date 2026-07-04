// Playful Bright — friendly, energetic, multi-color (berry/tangerine/mint/sky).
// Fraunces + Quicksand + Nunito Sans. Data-driven render module: tokenized
// template + array-regenerated blocks. Mirrors warm.mjs / clinical.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Rotating palette themes for the service cards — matches THIS design's
// --c / --bg custom-property hooks and its bespoke line-icon set.
const SVC_THEMES = [
  { c: "var(--berry)", bg: "var(--cloud)", icon: `<path d="M12 3c-2 0-2.6 1-4 1C6.5 4 5 3.4 4.6 5.6 4.2 8 4.9 10 5.5 12.2 6 14 6.3 16 7.4 16c1.2 0 1-2.4 2.1-2.4s.9 2.4 2.1 2.4h.8c1.2 0 1-2.4 2.1-2.4s.9 2.4 2.1 2.4c1.1 0 1.4-2 1.9-3.8.6-2.2 1.3-4.2.9-6.6C19.9 3.4 18.4 4 17 4c-1.4 0-2-1-4-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>` },
  { c: "var(--grape)", bg: "#F1ECFB", icon: `<path d="m12 3 2.3 4.9 5.4.6-4 3.7 1.1 5.3L12 15.4 7.2 18l1.1-5.3-4-3.7 5.4-.6L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>` },
  { c: "var(--sky)", bg: "var(--sky-wash)", icon: `<path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 5v6m-3-3h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
  { c: "var(--mint)", bg: "var(--mint-wash)", icon: `<path d="M7 4h10a3 3 0 013 3v3a5 5 0 01-5 5H9a5 5 0 01-5-5V7a3 3 0 013-3Z" stroke="currentColor" stroke-width="1.8"/><path d="M9 15v2a3 3 0 003 3 3 3 0 003-3v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
  { c: "var(--tangerine)", bg: "#FFEEE1", icon: `<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>` },
  { c: "var(--berry-deep)", bg: "#FDE6EE", icon: `<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>` },
];

// Gradient fills for review avatars, cycled.
const AV_GRADS = [
  "linear-gradient(140deg,var(--berry),var(--grape))",
  "linear-gradient(140deg,var(--mint),var(--sky))",
  "linear-gradient(140deg,var(--tangerine),var(--sunbeam))",
  "linear-gradient(140deg,var(--grape),var(--berry))",
];

const ARROW =
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHECK =
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const initials = (name = "") =>
  esc(
    String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase() || "★"
  );

// --- bespoke block builders (this design owns its class names) -------------

// .svc cards — colored top-bar + icon tile cycle through SVC_THEMES.
function playfulServices(services = [], bookUrl = "#book") {
  return (
    services
      .map((s, i) => {
        const t = SVC_THEMES[i % SVC_THEMES.length];
        const delay = (i % 3) + 1;
        return `\n        <article class="svc reveal d${delay}" style="--c:${t.c}; --bg:${t.bg};">
          <div class="ic"><svg viewBox="0 0 24 24" fill="none">${t.icon}</svg></div>
          <h3>${esc(s.name)}</h3>
          <p>${esc(s.desc || "")}</p>
          <a class="more" href="${esc(bookUrl)}">Learn more ${ARROW}</a>
        </article>`;
      })
      .join("") + "\n      "
  );
}

// .rev figures — avatar initial + name + source line.
function playfulReviews(reviews = [], locale = "") {
  return (
    reviews
      .map((r, i) => {
        const delay = (i % 3) + 1;
        const grad = AV_GRADS[i % AV_GRADS.length];
        const meta = `${esc(r.location || locale || "Verified review")} · Google`;
        return `\n        <figure class="rev reveal d${delay}">
          <span class="quote" aria-hidden="true">&rdquo;</span>
          <div class="stars" aria-label="5 out of 5 stars">★★★★★</div>
          <blockquote>${esc(r.quote)}</blockquote>
          <figcaption class="who">
            <span class="av" style="background:${grad};">${initials(r.name)}</span>
            <span><span class="nm">${esc(r.name)}</span><br><span class="mt">${meta}</span></span>
          </figcaption>
        </figure>`;
      })
      .join("") + "\n      "
  );
}

// .chk items for the hero trust checklist.
function playfulChecklist(trust = []) {
  return (
    trust
      .map((t) => `\n          <span class="chk">${CHECK} ${esc(t)}</span>`)
      .join("") + "\n        "
  );
}

// .hours-row lines; first row flagged open + "Open" pill.
function playfulHours(hours = []) {
  return (
    hours
      .map((h, i) => {
        const open = i === 0 ? " open" : "";
        const pill = i === 0 ? ` <span class="pill">Open</span>` : "";
        return `\n            <div class="hours-row${open}"><span class="day">${esc(h.label)}</span><span class="time tnum">${esc(h.time)}${pill}</span></div>`;
      })
      .join("") + "\n          "
  );
}

// footer <ul> service links.
function playfulFooterServices(services = []) {
  return (
    services
      .map((s) => `\n          <li><a href="#services">${esc(s.name)}</a></li>`)
      .join("") + "\n        "
  );
}

// booking-form <select> options: offer first, then each service.
function playfulServiceOptions(services = [], offerTitle = "", offerPrice = "") {
  const opts = [
    `<option>${esc(offerTitle || "New-client offer")}${offerPrice ? ` (${esc(offerPrice)})` : ""}</option>`,
    ...services.map((s) => `<option>${esc(s.name)}</option>`),
  ];
  return "\n                " + opts.join("\n                ") + "\n              ";
}

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "playful.tmpl.html"), "utf8");
  h = fillTokens(h, p);

  // Two-part hero headline; the italic swash carries the accent word(s).
  const hl = p.headline || { lead: "Dentistry you'll", accent: "actually look forward to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  const bookUrl = p.bookUrl || "#book";

  if (p.services?.length) {
    h = h.replace(
      /(<div class="svc-grid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${playfulServices(p.services, bookUrl)}$2`
    );
    h = h.replace(
      /(<h4>Services<\/h4>\s*<ul>)[\s\S]*?(<\/ul>)/,
      `$1${playfulFooterServices(p.services)}$2`
    );
    h = h.replace(
      /(<select id="reason" name="reason">)[\s\S]*?(<\/select>)/,
      `$1${playfulServiceOptions(p.services, p.offer?.title || "", p.offer?.price || "")}$2`
    );
  }

  if (p.reviews?.length) {
    h = h.replace(
      /(<div class="rev-grid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${playfulReviews(p.reviews, p.locale)}$2`
    );
  }

  if (p.trust?.length) {
    h = h.replace(
      /(<div class="hero-note">)[\s\S]*?(<\/div>)/,
      `$1${playfulChecklist(p.trust)}$2`
    );
  }

  if (p.hours?.length) {
    h = h.replace(
      /(<div class="hours-list">)[\s\S]*?(<\/div>\s*<div class="contact-row")/,
      `$1${playfulHours(p.hours)}</div>\n          <div class="contact-row"`
    );
  }

  return h;
}

export default { render };
