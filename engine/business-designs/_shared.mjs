// Shared helpers for the commercial (business) design renderers.
// Mirrors engine/church-designs/_shared.mjs. Each design module
// (clinical.mjs, bold.mjs, warm.mjs, editorial.mjs) imports what it needs.
//
// Designs are STYLE; the profile is CONTENT. A profile flexes any design to
// any vertical (dental, law, medspa, home services, ...).

export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Scalar identity/content tokens common to every business template.
export function scalarTokens(p = {}) {
  return {
    NAME: p.name || "Acme Co.",
    NAME_SHORT: p.nameShort || p.name || "Acme",
    LOCALE: p.locale || "",
    TAGLINE: p.tagline || "",
    LEDE: p.lede || "",
    PHONE: p.phone || "",
    BOOK_URL: p.bookUrl || "#book",
    RATING: p.rating || "5.0",
    REVIEW_COUNT: p.reviewCount || "",
    EST: p.founded || "",
    OFFER_PRICE: p.offer?.price || "",
    OFFER_TITLE: p.offer?.title || "",
    OFFER_DESC: p.offer?.desc || "",
  };
}

export function fillTokens(html, p) {
  const s = scalarTokens(p);
  for (const [k, v] of Object.entries(s)) html = html.split(`{{${k}}}`).join(esc(v));
  // hero photo path used by all four sample designs (optional image slot)
  if (p.hero) html = html.split("/assets/business/hero.jpg").join(p.hero);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(s.NAME)}${s.LOCALE ? " · " + esc(s.LOCALE) : ""}</title>`);
  return html;
}

// Reusable block builders. Class names are conventions; a design with
// different classes passes its own class name or supplies its own builder.
export const build = {
  // services: [{name, desc}]
  serviceCards: (services = [], cls = "svc") =>
    services.map((x, i) =>
      `\n      <article class="${cls} reveal"><span class="svc-n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(x.name)}</h3><p>${esc(x.desc || "")}</p></article>`
    ).join(""),
  // reviews: [{quote, name}]
  reviewCards: (reviews = [], cls = "rev") =>
    reviews.map((r) =>
      `\n      <figure class="${cls} reveal"><blockquote>${esc(r.quote)}</blockquote><figcaption>— ${esc(r.name)}</figcaption></figure>`
    ).join(""),
  // hours: [{label, time}]
  hoursList: (hours = []) =>
    hours.map((h) => `<li><span>${esc(h.label)}</span><span>${esc(h.time)}</span></li>`).join("\n      "),
  // trust: ["Same-week appointments", ...]
  trustItems: (trust = [], cls = "trust-item") =>
    trust.map((t) => `<li class="${cls}">${esc(t)}</li>`).join(""),
};
