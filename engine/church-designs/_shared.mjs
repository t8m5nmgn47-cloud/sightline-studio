// Shared helpers for the church design renderers.
// Each design module (flagship.mjs, reverent.mjs, ...) imports what it needs.
// Designs with matching structural class names can reuse the block builders;
// designs with bespoke markup pass their own builder or class names.

export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Scalar identity tokens common to every design template.
export function scalarTokens(p = {}) {
  return {
    NAME_FULL: p.nameFull || `${p.name || "Grace"} Church`,
    NAME: p.name || "Grace Church",
    LOCALE: p.locale || (p.campuses || []).map((c) => c.name).join(" · "),
    VERSE: p.verse || "Come to me, all who are weary and burdened, and I will give you rest.",
    VERSE_REF: p.verseRef || "Matthew 11:28",
    CAMPAIGN_KICKER: p.campaign?.kicker || "Our building campaign",
    CAMPAIGN_HEAD: p.campaign?.head || "Help us make room for what's next.",
    RAISED: p.campaign?.raised || "$0",
    GOAL: p.campaign?.goal || "$0",
    PCT: (p.campaign?.pct != null ? p.campaign.pct : 0) + "%",
    PCTN: String(p.campaign?.pct != null ? p.campaign.pct : 0),
    DONORS: p.campaign?.donors || "",
  };
}

export function fillTokens(html, p) {
  const s = scalarTokens(p);
  for (const [k, v] of Object.entries(s)) html = html.split(`{{${k}}}`).join(v);
  if (p.hero) html = html.split("/assets/captured/missionhills-org/hero-crop.jpg").join(p.hero);
  if (p.phone) html = html.split("(303) 555-0110").join(esc(p.phone));
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(s.NAME_FULL)}</title>`);
  return html;
}

// Reusable block builders. Class names match the flagship template; a design
// with different classes supplies its own builder via renderer options.
export const build = {
  campusCards: (campuses = [], cls = "campus") =>
    campuses.map((c) =>
      `\n      <div class="${cls} reveal"><h3>${esc(c.name)}</h3><div class="adr">${esc(c.note || "")}</div><div class="t">${esc(c.times || "")}</div><a href="${esc(c.map || "#")}">Directions →</a></div>`
    ).join(""),
  timesList: (times = []) =>
    times.map((t) => `<li><b>${esc(t.label)}</b><span>${esc(t.time)}</span></li>`).join("\n      "),
  footerCampusLinks: (campuses = []) =>
    campuses.map((c) => `<li><a href="#campuses">${esc(c.name)}</a></li>`).join(""),
  eventRows: (events = [], cls = "erow") =>
    events.map((e) =>
      `\n      <div class="${cls} reveal"><span class="date">${esc(e.date)}</span><div><h3>${esc(e.title)}</h3><p>${esc(e.detail)}</p></div><a class="go" href="${esc(e.link || "#")}">${esc(e.cta || "Register →")}</a></div>`
    ).join(""),
};
