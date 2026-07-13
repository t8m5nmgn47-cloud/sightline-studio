// Warm Premium — boutique-hospitality, moody-luxe. Deep plum + honey + sage,
// Fraunces + Hanken Grotesk. Data-driven render module: tokenized template +
// array-regenerated blocks. Mirrors engine/church-designs/flagship.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens, build } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Bespoke SVG glyphs matching THIS design's .ico / .trust-item art.
const SVC_ICON =
  `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L19 8l-3.5 3.4L16.5 17 12 14.3 7.5 17l1-5.6L5 8l5.1-.4z"/></svg>`;
const TRUST_ICON =
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

// --- bespoke block builders (this design owns its class names) -------------

// .svc cards; index 1 becomes the dark ".svc feature" spotlight, then a
// static "not sure where to start?" CTA card closes the grid.
function warmServices(services = [], bookUrl = "#book") {
  const cards = services
    .map((s, i) => {
      const feature = i === 1 ? " feature" : "";
      const delay = (i % 3) + 1;
      return `\n      <article class="svc${feature} reveal" data-delay="${delay}">
        <span class="ico" aria-hidden="true">${SVC_ICON}</span>
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.desc || "")}</p>
        <span class="more">Learn more <span aria-hidden="true">→</span></span>
      </article>`;
    })
    .join("");
  const cta = `\n      <article class="svc reveal" data-delay="3" style="display:flex;flex-direction:column;justify-content:center;background:var(--porcelain-2);border-color:transparent;">
        <h3 style="font-size:var(--step-2);margin-bottom:.8rem;">Not sure where<br>to start?</h3>
        <p style="margin-bottom:1.4rem;">Tell us what's on your mind and we'll build a plan around it — no pressure, ever.</p>
        <a href="${esc(bookUrl)}" class="btn btn-dark" style="align-self:flex-start;">Talk to our team</a>
      </article>`;
  return `${cards}${cta}\n    `;
}

// .rev blockquotes with .by avatar (initial) + name + source line.
function warmReviews(reviews = [], locale = "") {
  return (
    reviews
      .map((r, i) => {
        const name = String(r.name || "").trim();
        const initial = esc((name[0] || "?").toUpperCase());
        const sub = `${esc(r.location || locale || "Verified review")} · Google`;
        return `\n      <blockquote class="rev reveal" data-delay="${(i % 2) + 1}">
        <span class="stars" aria-hidden="true">★★★★★</span>
        <q>${esc(r.quote)}</q>
        <div class="by"><span class="av" aria-hidden="true">${initial}</span><div><b>${esc(r.name)}</b><span>${sub}</span></div></div>
      </blockquote>`;
      })
      .join("") + "\n    "
  );
}

// .trust-item spans joined by .trust-sep dividers.
function warmTrust(trust = []) {
  return trust
    .map((t) => `<span class="trust-item">${TRUST_ICON}${esc(t)}</span>`)
    .join(`\n    <span class="trust-sep" aria-hidden="true"></span>\n    `);
}

// .hours-row lines for the booking panel.
function warmHours(hours = []) {
  return hours
    .map(
      (h) =>
        `<div class="hours-row"><span class="day">${esc(h.label)}</span><span class="time tnum">${esc(h.time)}</span></div>`
    )
    .join("\n        ");
}

// footer <ul> service links.
function warmFooterServices(services = []) {
  return services.map((s) => `<li><a href="#services">${esc(s.name)}</a></li>`).join("\n          ");
}

// booking-form <select> options: offer first, then each service.
function warmServiceOptions(services = [], offerTitle = "", offerPrice = "") {
  const opts = [
    `<option>${esc(offerTitle || "New-client offer")}${offerPrice ? ` (${esc(offerPrice)})` : ""}</option>`,
    ...services.map((s) => `<option>${esc(s.name)}</option>`),
  ];
  return opts.join("\n            ");
}

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "warm.tmpl.html"), "utf8");
  h = fillTokens(h, p);

  // Brand mark = first letter of the (short) name.
  const initial = esc(((p.nameShort || p.name || "A").trim()[0] || "A").toUpperCase());
  h = h.split("{{MARK}}").join(initial);

  // Two-part hero headline; italic <em> carries the accent word(s).
  const hl = p.headline || { lead: "Dentistry you'll", accent: "actually look forward to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  // Glassmorphic hero review card — regenerated from reviews[0].
  const r0 = p.reviews?.[0];
  const heroQuote = r0?.quote || "I used to put this off for years — now I genuinely look forward to every visit.";
  const heroWho = r0?.name || "A happy client";
  h = h.split("{{HERO_QUOTE}}").join(esc(heroQuote)).split("{{HERO_WHO}}").join(esc(heroWho));

  const bookUrl = p.bookUrl || "#book";

  if (p.services?.length) {
    h = h.replace(
      /(<div class="svc-grid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${warmServices(p.services, bookUrl)}$2`
    );
    h = h.replace(
      /(<h5>Services<\/h5>\s*<ul>)[\s\S]*?(<\/ul>)/,
      `$1\n          ${warmFooterServices(p.services)}\n        $2`
    );
    h = h.replace(
      /(<select id="svc-sel">)[\s\S]*?(<\/select>)/,
      `$1\n            ${warmServiceOptions(p.services, p.offer?.title || "", p.offer?.price || "")}\n          $2`
    );
  }

  if (p.reviews?.length) {
    h = h.replace(
      /(<div class="rev-grid">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/section>)/,
      `$1${warmReviews(p.reviews, p.locale)}$2`
    );
  }

  if (p.trust?.length) {
    h = h.replace(
      /(<div class="wrap trust-inner">)[\s\S]*?(<\/div>\s*<\/section>)/,
      `$1\n    ${warmTrust(p.trust)}\n  $2`
    );
  }

  if (p.hours?.length) {
    h = h.replace(
      /(<span class="badge-open">[\s\S]*?<\/span>)[\s\S]*?(<\/div>\s*<div class="contact-block)/,
      `$1\n        ${warmHours(p.hours)}\n      $2`
    );
  }

  return h;
}

export default { render };
