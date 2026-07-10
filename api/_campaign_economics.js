// Campaign economics intelligence. Uses only campaigns with explicitly recorded
// result events so "no result recorded" is never confused with a true zero.
// Contribution subtracts recorded campaign spend only; it is not gross profit.

const ROUND = (n, digits = 1) => {
  const p = 10 ** digits;
  return Math.round(Number(n || 0) * p) / p;
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function meta(event) {
  return event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
}

function resultCount(event) {
  return Math.max(0, Math.round(num(meta(event).bookings ?? meta(event).count, 0)));
}

export function campaignEconomicRows(events = []) {
  const results = new Map();
  for (const event of events) {
    if (event.event_type !== "campaign_result" || !event.campaign_id) continue;
    results.set(event.campaign_id, {
      conversions: resultCount(event),
      revenue: num(event.value_numeric, 0),
      result_at: event.occurred_at,
    });
  }

  return events
    .filter((event) => event.event_type === "campaign_sent" && event.campaign_id)
    .map((event) => {
      const m = meta(event);
      const result = results.get(event.campaign_id);
      const spend = m.spend == null ? null : num(m.spend, null);
      const audience = m.audience_size == null ? null : num(m.audience_size, null);
      const revenue = result ? result.revenue : null;
      const conversions = result ? result.conversions : null;
      const contribution = result && spend != null ? revenue - spend : null;
      return {
        campaign_id: event.campaign_id,
        occurred_at: event.occurred_at,
        channel: event.channel || "unknown",
        offer: event.offer_id || "unspecified",
        creative: event.creative_id || "unspecified",
        comparison_group: String(m.comparison_group || ""),
        spend,
        audience,
        results_recorded: !!result,
        conversions,
        revenue,
        contribution,
        revenue_per_recipient: result && audience > 0 ? revenue / audience : null,
        cost_per_outcome: result && spend != null && conversions > 0 ? spend / conversions : null,
      };
    });
}

function aggregate(rows, value) {
  const recorded = rows.filter((row) => row.results_recorded);
  const withSpend = recorded.filter((row) => row.spend != null);
  const withAudience = recorded.filter((row) => row.audience > 0);
  const revenue = recorded.reduce((sum, row) => sum + row.revenue, 0);
  const conversions = recorded.reduce((sum, row) => sum + row.conversions, 0);
  const spend = withSpend.reduce((sum, row) => sum + row.spend, 0);
  const audience = withAudience.reduce((sum, row) => sum + row.audience, 0);
  const audienceRevenue = withAudience.reduce((sum, row) => sum + row.revenue, 0);
  return {
    value,
    campaigns: rows.length,
    results_recorded: recorded.length,
    spend_recorded: withSpend.length,
    audience_recorded: withAudience.length,
    revenue,
    conversions,
    spend,
    revenue_per_campaign: recorded.length ? revenue / recorded.length : null,
    conversions_per_campaign: recorded.length ? conversions / recorded.length : null,
    contribution_per_campaign: withSpend.length === recorded.length && recorded.length ? (revenue - spend) / recorded.length : null,
    cost_per_outcome: withSpend.length === recorded.length && conversions > 0 ? spend / conversions : null,
    revenue_per_recipient: audience > 0 ? audienceRevenue / audience : null,
    first: rows.slice().sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))[0]?.occurred_at || null,
    last: rows.slice().sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0]?.occurred_at || null,
  };
}

function comparisonCandidates(rows, dimension, comparisonSet, metric) {
  const sets = new Map();
  for (const row of rows) {
    const value = dimension(row);
    const setKey = comparisonSet(row);
    if (!value || value === "unknown" || value === "unspecified" || !setKey) continue;
    if (!sets.has(setKey)) sets.set(setKey, new Map());
    const groups = sets.get(setKey);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }

  const candidates = [];
  for (const [setKey, groups] of sets.entries()) {
    const eligible = [...groups.entries()]
      .map(([value, groupRows]) => aggregate(groupRows, value))
      .filter((group) => group.campaigns >= 3)
      .filter((group) => group.results_recorded >= 3)
      .filter((group) => group[metric] != null)
      .sort((a, b) => b[metric] - a[metric]);
    if (eligible.length < 2) continue;
    const best = eligible[0];
    const worst = eligible[eligible.length - 1];
    const absolute = best[metric] - worst[metric];
    const relative = worst[metric] > 0 ? absolute / worst[metric] : best[metric] > 0 ? 1 : 0;
    if (absolute <= 0 || relative < 0.15) continue;
    candidates.push({ setKey, best, worst, absolute, relative, sample: best.results_recorded + worst.results_recorded, metric });
  }
  return candidates.sort((a, b) => b.relative - a.relative);
}

function confidence(sample) {
  if (sample >= 20) return "high";
  if (sample >= 10) return "medium";
  return "low";
}

function cardFromCandidate(candidate, config) {
  if (!candidate) return null;
  const { best, worst, absolute, relative, sample } = candidate;
  return {
    type: "repeat",
    headline: config.headline(best.value, worst.value),
    body: config.body(best, worst),
    recommendation: config.recommendation(best.value, worst.value),
    confidence: confidence(sample),
    evidence: {
      sample_size: sample,
      period_start: [best.first, worst.first].filter(Boolean).sort()[0] || null,
      period_end: [best.last, worst.last].filter(Boolean).sort().reverse()[0] || null,
      comparison: config.comparison(best, worst),
      absolute_lift: ROUND(absolute, config.digits ?? 1),
      relative_lift: ROUND(relative * 100, 0),
      source: "campaign_economics",
      caveat: config.caveat,
    },
  };
}

function money(n) {
  return `$${ROUND(n, 2).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function buildCampaignEconomics(events = []) {
  const rows = campaignEconomicRows(events);
  const recorded = rows.filter((row) => row.results_recorded);
  const summary = {
    campaigns: rows.length,
    results_recorded: recorded.length,
    spend_recorded: recorded.filter((row) => row.spend != null).length,
    audience_recorded: recorded.filter((row) => row.audience > 0).length,
    revenue_recorded: recorded.reduce((sum, row) => sum + row.revenue, 0),
    recorded_spend: recorded.filter((row) => row.spend != null).reduce((sum, row) => sum + row.spend, 0),
    conversions_recorded: recorded.reduce((sum, row) => sum + row.conversions, 0),
  };

  const configs = [
    {
      dimension: (r) => r.channel,
      set: (r) => `${r.comparison_group || "ungrouped"}|offer:${r.offer}`,
      metric: "revenue_per_campaign",
      headline: (best, worst) => `${best.toUpperCase()} is producing more recorded revenue per campaign than ${worst.toUpperCase()}`,
      body: (best, worst) => `${best.value.toUpperCase()} averaged ${money(best.revenue_per_campaign)} in recorded campaign revenue versus ${money(worst.revenue_per_campaign)} for ${worst.value.toUpperCase()} in a comparable set.`,
      recommendation: (best, worst) => `Shift one comparable campaign from ${worst} to ${best}, keep the offer and audience similar, and confirm the revenue difference persists.`,
      comparison: (best, worst) => `${best.value.toUpperCase()} ${money(best.revenue_per_campaign)} vs ${worst.value.toUpperCase()} ${money(worst.revenue_per_campaign)} revenue/campaign`,
      caveat: "Revenue attribution is only as reliable as the recorded campaign result. This comparison does not account for fulfillment cost or gross margin.",
    },
    {
      dimension: (r) => r.offer,
      set: (r) => `${r.comparison_group || "ungrouped"}|channel:${r.channel}`,
      metric: "revenue_per_campaign",
      headline: (best, worst) => `Offer “${best}” is producing more recorded revenue per campaign than “${worst}”`,
      body: (best, worst) => `Offer “${best.value}” averaged ${money(best.revenue_per_campaign)} in recorded campaign revenue versus ${money(worst.revenue_per_campaign)} for “${worst.value}” in a comparable set.`,
      recommendation: (best) => `Repeat offer “${best}” in one comparable campaign while holding channel and audience steady, then confirm the revenue gap.`,
      comparison: (best, worst) => `${best.value} ${money(best.revenue_per_campaign)} vs ${worst.value} ${money(worst.revenue_per_campaign)} revenue/campaign`,
      caveat: "Higher revenue is not necessarily higher profit. Gross margin, labor, fulfillment, and overhead are not included unless separately supplied.",
    },
    {
      dimension: (r) => r.channel,
      set: (r) => `${r.comparison_group || "ungrouped"}|offer:${r.offer}`,
      metric: "contribution_per_campaign",
      headline: (best, worst) => `${best.toUpperCase()} is producing more contribution after recorded campaign spend than ${worst.toUpperCase()}`,
      body: (best, worst) => `${best.value.toUpperCase()} averaged ${money(best.contribution_per_campaign)} in revenue minus recorded campaign spend versus ${money(worst.contribution_per_campaign)} for ${worst.value.toUpperCase()}.`,
      recommendation: (best, worst) => `Run one more comparable ${best} versus ${worst} test and keep spend tracking complete before changing the channel mix.`,
      comparison: (best, worst) => `${best.value.toUpperCase()} ${money(best.contribution_per_campaign)} vs ${worst.value.toUpperCase()} ${money(worst.contribution_per_campaign)} contribution/campaign`,
      caveat: "Contribution subtracts recorded campaign spend only. It is not gross profit and excludes labor, fulfillment, cost of goods, and overhead.",
    },
  ];

  const cards = [];
  for (const config of configs) {
    const candidate = comparisonCandidates(rows, config.dimension, config.set, config.metric)[0];
    const card = cardFromCandidate(candidate, config);
    if (card) cards.push(card);
  }

  return { summary, rows, cards };
}
