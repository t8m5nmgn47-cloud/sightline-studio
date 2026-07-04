// Luxe Mono — near-black + ivory + champagne, Bodoni Moda + Jost.
// Fashion-editorial luxury: giant ghost monogram, double-ruled price card,
// numbered editorial service index. Data-driven render module.
// Design = STYLE; profile = CONTENT (flexes to any vertical).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, fillTokens } from "./_shared.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Bespoke builders — this design owns its class names (svc / rev / hr /
// cell / foot-col), so it can't reuse the generic build.* markup.
const b = {
  // Trust bar: profile supplies plain strings; render each as the big serif
  // "stat". An object item may carry {stat,label} to also fill the caption.
  trustCells: (trust = []) =>
    trust.map((t, i) => {
      const stat = typeof t === "string" ? t : (t.stat || "");
      const label = typeof t === "object" ? t.label : "";
      const d = i > 0 ? ` data-d="${i}"` : "";
      return (
        `\n    <div class="cell" data-reveal${d}>` +
        `\n      <span class="stat">${esc(stat)}</span>` +
        (label ? `\n      <span class="lbl">${esc(label)}</span>` : "") +
        `\n    </div>`
      );
    }).join(""),

  // Numbered editorial service index (01, 02, ...) — count flexes with services.
  serviceRows: (services = [], bookUrl = "#book") =>
    services.map((x, i) =>
      `\n    <a class="svc" href="${esc(bookUrl)}" data-reveal>` +
      `\n      <span class="sn">${String(i + 1).padStart(2, "0")}</span>` +
      `\n      <span>` +
      `\n        <span class="st">${esc(x.name)}</span>` +
      `\n        <span class="sd">${esc(x.desc || "")}</span>` +
      `\n      </span>` +
      `\n      <span class="sarw" aria-hidden="true">&#8599;</span>` +
      `\n    </a>`
    ).join(""),

  reviewRows: (reviews = []) =>
    reviews.map((r, i) => {
      const initial = esc(String(r.name || "?").trim().charAt(0).toUpperCase());
      const sub = esc(r.role || r.sub || r.location || "Verified review");
      const d = i > 0 ? ` data-d="${i}"` : "";
      return (
        `\n      <figure class="rev" data-reveal${d}>` +
        `\n        <span class="stars" aria-label="Five stars">&#9733; &#9733; &#9733; &#9733; &#9733;</span>` +
        `\n        <blockquote><span class="q">&ldquo;</span>${esc(r.quote)}<span class="q">&rdquo;</span></blockquote>` +
        `\n        <figcaption class="who">` +
        `\n          <span class="av" aria-hidden="true">${initial}</span>` +
        `\n          <span><span class="nm">${esc(r.name)}</span><br><span class="mt">${sub}</span></span>` +
        `\n        </figcaption>` +
        `\n      </figure>`
      );
    }).join(""),

  hoursRows: (hours = []) =>
    hours.map((h) => {
      const closed = /closed/i.test(h.time || "");
      return (
        `\n        <div class="hr${closed ? " closed" : ""}">` +
        `<span class="d">${esc(h.label)}</span>` +
        `<span class="t${closed ? "" : " num"}">${esc(h.time)}</span></div>`
      );
    }).join(""),

  footerLinks: (services = []) =>
    services.map((x) => `\n          <a href="#services">${esc(x.name)}</a>`).join(""),

  selectOptions: (services = [], offerTitle = "") =>
    (offerTitle ? `\n          <option>${esc(offerTitle)}</option>` : "") +
    services.map((x) => `\n          <option>${esc(x.name)}</option>`).join(""),

  offerPoints: (points = []) =>
    points.map((p) =>
      `\n        <li><span class="tick" aria-hidden="true">&#10022;</span> ${esc(p)}</li>`
    ).join(""),
};

export function render(p = {}) {
  let h = fs.readFileSync(path.join(HERE, "luxe.tmpl.html"), "utf8");

  // EST heritage line — fill before fillTokens so the default (2004) applies
  // when a profile omits `founded`; a supplied year (e.g. 2016) wins.
  h = h.split("{{EST}}").join(esc(p.founded || "2004"));

  // Scalar identity/content tokens (NAME, LOCALE, TAGLINE, LEDE, PHONE,
  // RATING, REVIEW_COUNT, OFFER_*, BOOK_URL) + <title>.
  h = fillTokens(h, p);

  // Ghost monogram — first letter of the business name, drawn oversized
  // behind the hero (and reused in the team portrait frames).
  const mono = esc(String(p.name || "A").trim().charAt(0).toUpperCase());
  h = h.split("{{MONOGRAM}}").join(mono);

  // Double-ruled price card: keep the small superscript currency by splitting
  // the offer price ("$100" -> "$" + "100") into OFFER_CUR + OFFER_NUM.
  // A contiguous {{OFFER_PRICE}} still lands in the CTA so "$100" appears whole.
  const price = String(p.offer?.price || "");
  const m = price.match(/^(\D*)([\s\S]*)$/);
  const cur = m ? m[1] : "";
  const num = m ? m[2] : price;
  h = h.split("{{OFFER_CUR}}").join(esc(cur)).split("{{OFFER_NUM}}").join(esc(num));

  // Two-part hero headline: lead (plain ivory) + accent (champagne Bodoni-italic).
  const hl = p.headline || { lead: "Dentistry you'll", accent: "actually look forward to." };
  h = h.split("{{HERO_LEAD}}").join(esc(hl.lead)).split("{{HERO_ACCENT}}").join(esc(hl.accent));

  // Trust bar cells
  if (p.trust?.length)
    h = h.replace(/(<div class="row">)[\s\S]*?(<\/div>\s*<\/section>)/, `$1${b.trustCells(p.trust)}\n  $2`);

  // Numbered service index — regenerate rows from p.services (count flexes).
  if (p.services?.length)
    h = h.replace(/(<div class="list">)[\s\S]*?(<\/div>)/, `$1${b.serviceRows(p.services, p.bookUrl || "#book")}\n  $2`);

  // Reviews
  if (p.reviews?.length)
    h = h.replace(/(<div class="rev-grid">)[\s\S]*?(<\/div>)/, `$1${b.reviewRows(p.reviews)}\n    $2`);

  // Office hours rows (between the "Opening hours" wrapper and the contact line)
  if (p.hours?.length)
    h = h.replace(/(<div class="hours"[\s\S]*?aria-label="Opening hours">)[\s\S]*?(<\/div>\s*<div class="contact-line")/, `$1${b.hoursRows(p.hours)}\n      $2`);

  // Booking form service select — options mirror the service list.
  if (p.services?.length)
    h = h.replace(/(<select id="f-svc"[^>]*>)[\s\S]*?(<\/select>)/, `$1${b.selectOptions(p.services, p.offer?.title || "")}\n        $2`);

  // Footer service links (mirror the service index)
  if (p.services?.length)
    h = h.replace(/(<div class="foot-col" data-col="services">\s*<h4>[^<]*<\/h4>)[\s\S]*?(<\/div>)/, `$1${b.footerLinks(p.services)}\n        $2`);

  // Optional offer bullet points
  if (p.offer?.points?.length)
    h = h.replace(/(<ul data-reveal data-d="2">)[\s\S]*?(<\/ul>)/, `$1${b.offerPoints(p.offer.points)}\n      $2`);

  return h;
}

export default { render };
