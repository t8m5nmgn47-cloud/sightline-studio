/* Sightline outreach copy engine — generates the cold-email subject + body from
 * MEASURED audit stats, so the numbers always match the live teardown. Two
 * angles: "leader" (prospect already ranks high) and "gap" (has a clear issue).
 * Browser global: window.SL_outreach.email(prospect, stats). */
(function (w) {
  function email(p, st) {
    const name = p.name || p.domain || "your business";
    const city = p.city || "local";
    const vert = (p.vertical || p.vert || "local").toLowerCase();
    const funnel = p.funnel || "";
    const rank = st.rank, count = st.count, gap = st.top_gap || "a few small things worth tightening";
    const peers = /church|faith/.test(vert) ? "churches" : /school|childcare|edu/.test(vert) ? "schools" : `${vert} businesses`;
    const standing = `#${rank} of ${count} comparable ${city} ${peers} online`;

    const subject = st.leads
      ? `${name} — you're ahead online (I built you a demo)`
      : `a new website for ${name} (already built)`;

    const intro = `Hi there,\n\nI'm local and design websites for ${city} ${peers}. Instead of pitching, I built ${name} a full demo you can click through — and ran a free security + reputation check on your site while I was at it.`;

    const middle = st.leads
      ? `Good news: you already come out ${standing}, ahead of most of your local field. The demo shows how a modern rebuild keeps you there and sharpens it — and the one thing still worth locking down is: ${gap}.`
      : `Here's the honest picture: you came out ${standing}. The main gap I found was: ${gap}. The demo I built fixes that as part of the rebuild.`;

    const close = `Everything's in one place — your demo and the full audit:\n${funnel}\n\nNo obligation. If it's useful, reply and I'll walk you through it; if not, keep the audit on me.\n\n— Sightline Studio`;

    return { subject, body: `${intro}\n\n${middle}\n\n${close}` };
  }
  w.SL_outreach = { email };
})(typeof window !== "undefined" ? window : globalThis);
