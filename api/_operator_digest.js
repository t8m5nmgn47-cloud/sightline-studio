// Build a compact internal operator digest from scheduled intelligence refresh
// results. Pure function: delivery stays optional through the existing Slack hook.

const TYPE_PRIORITY = { fix: 1, repeat: 2, test: 3 };
const TYPE_ICON = { fix: "🔴", repeat: "🟢", test: "🔵" };

function clean(v, max = 300) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function newInsightItems(results = []) {
  const items = [];
  for (const row of results) {
    for (const insight of row.new_insights || []) {
      items.push({
        business: clean(row.name || row.domain, 120),
        domain: clean(row.domain, 160),
        type: insight.type,
        headline: clean(insight.headline, 300),
        confidence: clean(insight.confidence || "low", 20),
      });
    }
  }
  return items.sort((a, b) =>
    (TYPE_PRIORITY[a.type] || 9) - (TYPE_PRIORITY[b.type] || 9)
    || a.business.localeCompare(b.business)
    || a.headline.localeCompare(b.headline));
}

export function buildOperatorDigest(results = [], opts = {}) {
  const baseUrl = String(opts.baseUrl || "https://sightline-studio.vercel.app").replace(/\/$/, "");
  const items = newInsightItems(results);
  const created = items.length;
  const expired = results.reduce((sum, row) => sum + Number(row.expired || 0), 0);
  const errors = results.filter((row) => row.error).length;
  const processed = results.length;
  const shouldNotify = created > 0 || expired > 0 || errors > 0;

  const lines = [
    `*Sightline Intelligence Daily*`,
    `${created} new recommendation${created === 1 ? "" : "s"} · ${expired} expired · ${errors} error${errors === 1 ? "" : "s"} · ${processed} businesses processed`,
  ];

  if (items.length) {
    lines.push("", "*Top new decisions*");
    for (const item of items.slice(0, 5)) {
      const icon = TYPE_ICON[item.type] || "•";
      lines.push(`${icon} *${item.business}* — ${item.headline} _(${item.confidence} confidence)_`);
    }
    if (items.length > 5) lines.push(`…and ${items.length - 5} more new recommendation${items.length - 5 === 1 ? "" : "s"}.`);
  }

  const failures = results.filter((row) => row.error).slice(0, 3);
  if (failures.length) {
    lines.push("", "*Refresh issues*");
    for (const row of failures) lines.push(`⚠️ ${clean(row.name || row.domain, 120)} — ${clean(row.error, 220)}`);
  }

  lines.push("", `<${baseUrl}/intelligence/portfolio/|Open Intelligence Portfolio>`);

  return {
    should_notify: shouldNotify,
    created,
    expired,
    errors,
    processed,
    items,
    text: lines.join("\n"),
  };
}
