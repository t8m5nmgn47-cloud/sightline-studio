// Editorial Authority — deep pine-teal + brass, Fraunces + Archivo.
// Prestige-firm restraint: "EST." heritage line, numbered service index 01–05.
// Data-driven render module. Design = STYLE; profile = CONTENT.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Bespoke builders — this design has its OWN class names (svc / quote / hours__row /
// trust__item), so we can't reuse the generic build.* markup.
const b = {
  // Numbered service index. The 01–05 numbers are a decorative sequence emitted
  // here (zero-padded), so the count flexes with p.services.length.
  serviceRows: (services = [], bookUrl = "#book") =>
    services.map((x, i) =>
      `\n      <a class="svc" href="${esc(bookUrl)}" data-reveal>` +
      `\n        <span class="svc__num tnum">${String(i + 1).padStart(2, "0")}</span>` +
      `\n        <span class="svc__name">${esc(x.name)}</span>` +
      `\n        <span class="svc__desc">${esc(x.desc || "")}</span>` +
      `\n        <span class="svc__arw" aria-hidden="true">→</span>` +
      `\n      </a>`
    ).join(""),

  reviewRows: (reviews = []) =>
    reviews.map((r, i) => {
      const initial = esc(String(r.name || "?").trim().charAt(0).toUpperCase());
      const sub = esc(r.role || r.sub || r.location || "Verified review");
      const d = i > 0 ? ` data-d="${i}"` : "";
      return (
        `\n      <figure class="quote" data-reveal${d}>` +
        `\n        <div class="quote__stars" aria-label="5 out of 5 stars">★★★★★</div>` +
        `\n        <blockquote class="quote__text">${esc(r.quote)}</blockquote>` +
        `\n        <figcaption class="quote__by">` +
        `\n          <span class="quote__av" aria-hidden="true">${initial}</span>` +
        `\n          <span><b>${esc(r.name)}</b><span>${sub}</span></span>` +
        `\n        </figcaption>` +
        `\n      </figure>`
      );
    }).join(""),

  hoursRows: (hours = []) =>
    hours.map((h) =>
      `\n      <div class="hours__row"><span class="d">${esc(h.label)}</span><span class="t tnum">${esc(h.time)}</span></div>`
    ).join(""),

  trustItems: (trust = []) =>
    trust.map((t, i) =>
      `\n    <div class="trust__item" data-reveal data-d="${i + 1}"><b class="tnum">${esc(t)}</b></div>`
    ).join(""),

  footerLinks: (services = []) =>
    services.map((x) => `\n          <li><a href="#services">${esc(x.name)}</a></li>`).join(""),

  offerPoints: (points = []) =>
    points.map((p) => `\n        <li>${esc(p)}</li>`).join(""),
};

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "editorial.tmpl.html"), "utf8");

  // EST heritage line — fill before fillTokens so the default (2003) applies
  // when a profile omits `founded`; a supplied year (e.g. 2016) wins.
  h = h.split("{{EST}}").join(esc(p.founded || "2003"));

  // Scalar identity/content tokens (NAME, LOCALE, TAGLINE, LEDE, PHONE,
  // RATING, REVIEW_COUNT, OFFER_*, BOOK_URL) + <title> + hero image slot.
  h = fillTokens(h, p);

  // Decorative price: keep the small superscript currency span by splitting
  // the offer price ("$100" -> "$" + "100") into OFFER_CUR + OFFER_NUM.
  const price = String(p.offer?.price || "");
  const m = price.match(/^(\D*)([\s\S]*)$/);
  const cur = m ? m[1] : "";
  const num = m ? m[2] : price;
  h = h.split("{{OFFER_CUR}}").join(esc(cur)).split("{{OFFER_NUM}}").join(esc(num));

  // Two-part hero headline: lead (plain) + accent (brass italic + underline sweep).
  const hl = p.headline || { lead: "Dentistry you'll actually", accent: "look forward to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  // Numbered service index — regenerate rows from p.services (count flexes).
  if (p.services?.length)
    h = h.replace(/(<div class="svc-list">)[\s\S]*?(<\/div>)/, `$1${b.serviceRows(p.services, p.bookUrl || "#book")}\n    $2`);

  // Reviews
  if (p.reviews?.length)
    h = h.replace(/(<div class="reviews__grid">)[\s\S]*?(<\/div>)/, `$1${b.reviewRows(p.reviews)}\n    $2`);

  // Office hours rows (between the sub line and the note)
  if (p.hours?.length)
    h = h.replace(/(<p class="sub">[\s\S]*?<\/p>)[\s\S]*?(\s*<div class="hours__note">)/, `$1${b.hoursRows(p.hours)}\n      $2`);

  // Trust bar
  if (p.trust?.length)
    h = h.replace(/(<div class="wrap trust__in">)[\s\S]*?(<\/div>\s*<\/section>)/, `$1${b.trustItems(p.trust)}\n  $2`);

  // Footer service links (mirror the service index)
  if (p.services?.length)
    h = h.replace(/(<h5>Services<\/h5>\s*<ul>)[\s\S]*?(<\/ul>)/, `$1${b.footerLinks(p.services)}\n        $2`);

  // Optional offer bullet points
  if (p.offer?.points?.length)
    h = h.replace(/(<ul class="offer__list">)[\s\S]*?(<\/ul>)/, `$1${b.offerPoints(p.offer.points)}\n      $2`);

  return h;
}

export default { render };
