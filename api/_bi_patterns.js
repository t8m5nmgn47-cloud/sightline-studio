// Sightline BI v2 — deterministic pattern engines layered on top of the base
// Opportunity Feed. These functions never invent missing evidence and are
// intentionally transparent enough to explain every recommendation.

const OUTCOME_TYPES = new Set(["booking_created", "conversion", "sale_completed", "lead_created"]);
const DAY_MS = 86_400_000;

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function meta(event) {
  return event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
}

function eventCount(event) {
  return Math.max(1, Math.round(num(meta(event).count, 1)));
}

function confidence(sample, high = 20, medium = 10) {
  if (sample >= high) return "high";
  if (sample >= medium) return "medium";
  return "low";
}

function card(type, headline, body, recommendation, evidence = {}) {
  return {
    type,
    headline,
    body,
    recommendation,
    confidence: evidence.confidence || "low",
    evidence: {
      sample_size: evidence.sample_size ?? null,
      period_start: evidence.period_start || null,
      period_end: evidence.period_end || null,
      comparison: evidence.comparison || null,
      absolute_lift: evidence.absolute_lift ?? null,
      relative_lift: evidence.relative_lift ?? null,
      source: evidence.source || null,
      caveat: evidence.caveat || null,
    },
  };
}

function campaignRows(events) {
  const outcomes = new Map();
  for (const e of events) {
    if (!OUTCOME_TYPES.has(e.event_type) || !e.campaign_id) continue;
    const rec = outcomes.get(e.campaign_id) || { conversions: 0, value: 0 };
    rec.conversions += eventCount(e);
    rec.value += num(e.value_numeric);
    outcomes.set(e.campaign_id, rec);
  }

  return events
    .filter((e) => e.event_type === "campaign_sent" && e.campaign_id)
    .map((e) => {
      const out = outcomes.get(e.campaign_id) || { conversions: 0, value: 0 };
      return {
        campaign_id: e.campaign_id,
        occurred_at: e.occurred_at,
        channel: e.channel || "unknown",
        offer: e.offer_id || "unspecified",
        creative: e.creative_id || "unspecified",
        comparison_group: String(meta(e).comparison_group || ""),
        converted: out.conversions > 0 ? 1 : 0,
        conversions: out.conversions,
        value: out.value,
      };
    });
}

function bestComparison(rows, dimension, comparisonSet) {
  const sets = new Map();
  for (const row of rows) {
    const setKey = comparisonSet(row);
    const value = dimension(row);
    if (!value || value === "unknown" || value === "unspecified") continue;
    if (!sets.has(setKey)) sets.set(setKey, new Map());
    const groups = sets.get(setKey);
    const rec = groups.get(value) || {
      value,
      campaigns: 0,
      converted_campaigns: 0,
      conversions: 0,
      revenue: 0,
      first: row.occurred_at,
      last: row.occurred_at,
    };
    rec.campaigns += 1;
    rec.converted_campaigns += row.converted;
    rec.conversions += row.conversions;
    rec.revenue += row.value;
    if (Date.parse(row.occurred_at) < Date.parse(rec.first)) rec.first = row.occurred_at;
    if (Date.parse(row.occurred_at) > Date.parse(rec.last)) rec.last = row.occurred_at;
    groups.set(value, rec);
  }

  const candidates = [];
  for (const [setKey, groups] of sets.entries()) {
    const eligible = [...groups.values()]
      .filter((g) => g.campaigns >= 3)
      .map((g) => ({
        ...g,
        rate: g.converted_campaigns / g.campaigns,
        conversions_per_campaign: g.conversions / g.campaigns,
        revenue_per_campaign: g.revenue / g.campaigns,
      }))
      .sort((a, b) => b.rate - a.rate || b.revenue_per_campaign - a.revenue_per_campaign);
    if (eligible.length < 2) continue;
    const best = eligible[0];
    const worst = eligible[eligible.length - 1];
    const absolute = best.rate - worst.rate;
    const relative = worst.rate > 0 ? absolute / worst.rate : best.rate > 0 ? 1 : 0;
    const sample = best.campaigns + worst.campaigns;
    const conversions = best.conversions + worst.conversions;
    if (absolute <= 0 || relative < 0.15 || conversions < 4) continue;
    candidates.push({ setKey, best, worst, absolute, relative, sample, conversions });
  }
  return candidates.sort((a, b) => b.relative - a.relative)[0] || null;
}

function dimensionCard(rows, config) {
  const candidate = bestComparison(rows, config.dimension, config.comparisonSet);
  if (!candidate) return null;
  const { best, worst, absolute, relative, sample } = candidate;
  const bestRate = Math.round(best.rate * 1000) / 10;
  const worstRate = Math.round(worst.rate * 1000) / 10;
  return card(
    config.type || "repeat",
    `${config.label(best.value)} is outperforming ${config.label(worst.value)}`,
    `${bestRate}% of campaigns using ${config.label(best.value)} produced a recorded business outcome versus ${worstRate}% for ${config.label(worst.value)} in a comparable set.`,
    config.recommendation(best.value, worst.value),
    {
      sample_size: sample,
      period_start: [best.first, worst.first].sort()[0],
      period_end: [best.last, worst.last].sort().reverse()[0],
      comparison: `${config.label(best.value)} ${bestRate}% vs ${config.label(worst.value)} ${worstRate}%`,
      absolute_lift: Math.round(absolute * 1000) / 10,
      relative_lift: Math.round(relative * 100),
      source: "campaign_events",
      confidence: confidence(sample),
    },
  );
}

export function buildCampaignPatternCards(events = []) {
  const rows = campaignRows(events);
  if (!rows.length) return [];

  const channel = dimensionCard(rows, {
    dimension: (r) => r.channel,
    comparisonSet: (r) => `${r.comparison_group || "ungrouped"}|offer:${r.offer}`,
    label: (v) => v.toUpperCase(),
    recommendation: (best, worst) => `Keep the next offer comparable and shift one ${worst} campaign to ${best}. Measure bookings or sales, not clicks alone.`,
  });

  const offer = dimensionCard(rows, {
    dimension: (r) => r.offer,
    comparisonSet: (r) => `${r.comparison_group || "ungrouped"}|channel:${r.channel}`,
    label: (v) => `offer “${v}”`,
    recommendation: (best, worst) => `Repeat ${best} in the next comparable campaign and hold channel and audience steady before reducing use of ${worst}.`,
  });

  const creative = dimensionCard(rows, {
    dimension: (r) => r.creative,
    comparisonSet: (r) => `${r.comparison_group || "ungrouped"}|${r.channel}|${r.offer}`,
    label: (v) => `creative “${v}”`,
    recommendation: (best, worst) => `Reuse the winning elements from ${best} in the next comparable campaign, then retest against ${worst} with the same offer and channel.`,
  });

  return [channel, offer, creative].filter(Boolean);
}

function reviewSentiment(event) {
  const m = meta(event);
  if (["positive", "negative", "neutral"].includes(m.sentiment)) return m.sentiment;
  const rating = num(m.rating, 0);
  if (rating >= 4) return "positive";
  if (rating > 0 && rating <= 3) return "negative";
  return "neutral";
}

export function buildReviewThemeCard(events = [], generatedAt = new Date().toISOString()) {
  const now = Date.parse(generatedAt);
  const reviews = events.filter((e) => e.event_type === "review_received" && meta(e).theme);
  if (reviews.length < 3) return null;

  const currentStart = now - 90 * DAY_MS;
  const previousStart = now - 180 * DAY_MS;
  const buckets = new Map();
  for (const e of reviews) {
    const at = Date.parse(e.occurred_at);
    if (!Number.isFinite(at) || at < previousStart || at > now) continue;
    const theme = String(meta(e).theme).trim().toLowerCase();
    if (!theme) continue;
    const sentiment = reviewSentiment(e);
    const key = `${sentiment}|${theme}`;
    const rec = buckets.get(key) || { theme, sentiment, current: 0, previous: 0 };
    if (at >= currentStart) rec.current += eventCount(e);
    else rec.previous += eventCount(e);
    buckets.set(key, rec);
  }

  const negative = [...buckets.values()]
    .filter((r) => r.sentiment === "negative" && r.current >= 3 && r.current >= r.previous + 2)
    .sort((a, b) => (b.current - b.previous) - (a.current - a.previous))[0];
  if (negative) {
    return card(
      "fix",
      `“${negative.theme}” is an emerging review problem`,
      `Sightline counted ${negative.current} negative mentions in the last 90 days versus ${negative.previous} in the prior 90-day window.`,
      `Review the customer journey behind “${negative.theme}”, make one operational change, and watch the next 90 days for the theme to decline.`,
      {
        sample_size: negative.current + negative.previous,
        period_start: new Date(previousStart).toISOString(),
        period_end: generatedAt,
        comparison: `${negative.current} recent vs ${negative.previous} prior`,
        source: "review_events",
        confidence: confidence(negative.current + negative.previous, 12, 6),
      },
    );
  }

  const positive = [...buckets.values()]
    .filter((r) => r.sentiment === "positive" && r.current >= 3)
    .sort((a, b) => b.current - a.current)[0];
  if (!positive) return null;
  return card(
    "repeat",
    `Customers keep praising “${positive.theme}”`,
    `The last 90 days include ${positive.current} positive review mentions tied to this theme.`,
    `Use “${positive.theme}” as proof in website copy, sales follow-up, and the next content test without overstating beyond the reviews you have.`,
    {
      sample_size: positive.current,
      period_start: new Date(currentStart).toISOString(),
      period_end: generatedAt,
      comparison: `${positive.current} positive mentions`,
      source: "review_events",
      confidence: confidence(positive.current, 10, 5),
    },
  );
}

function overallDelta(rows = []) {
  const values = rows
    .filter((r) => r.metric === "overall_score" && Number.isFinite(Number(r.value_numeric)))
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  if (values.length < 2) return null;
  const previous = values[values.length - 2];
  const latest = values[values.length - 1];
  return {
    delta: num(latest.value_numeric) - num(previous.value_numeric),
    first: previous.observed_at,
    last: latest.observed_at,
    count: values.length,
  };
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildCompetitorMovementCard(entityObservations = [], peerObservations = []) {
  const own = overallDelta(entityObservations);
  if (!own) return null;
  const grouped = new Map();
  for (const row of peerObservations) {
    if (!row.entity_key) continue;
    if (!grouped.has(row.entity_key)) grouped.set(row.entity_key, []);
    grouped.get(row.entity_key).push(row);
  }
  const peerDeltas = [...grouped.values()].map(overallDelta).filter(Boolean);
  if (peerDeltas.length < 2) return null;
  const peerMedian = median(peerDeltas.map((p) => p.delta));
  const advantage = own.delta - peerMedian;
  if (Math.abs(advantage) < 3) return null;
  const gaining = advantage > 0;
  return card(
    gaining ? "repeat" : "fix",
    gaining ? "You are gaining ground on the stored comparison set" : "The stored comparison set is moving faster than you",
    `Your measured score changed ${own.delta >= 0 ? "+" : ""}${own.delta} points while the median peer change was ${peerMedian >= 0 ? "+" : ""}${peerMedian}.`,
    gaining
      ? "Protect the changes that improved your score and keep measuring the same peer set before making a broader market claim."
      : "Compare which score areas improved for the fastest-moving peers, then choose one measurable gap to close before the next refresh.",
    {
      sample_size: peerDeltas.length + 1,
      period_start: own.first,
      period_end: own.last,
      comparison: `You ${own.delta >= 0 ? "+" : ""}${own.delta} vs peer median ${peerMedian >= 0 ? "+" : ""}${peerMedian}`,
      absolute_lift: Math.round(advantage * 10) / 10,
      source: "scheduled_audit_refresh",
      confidence: peerDeltas.length >= 5 ? "medium" : "low",
      caveat: "This compares the stored peer set, not the whole market. Peer relevance must be reviewed before using the result in public claims.",
    },
  );
}

export function enrichOpportunityFeed(baseFeed, { observations = [], events = [], peerObservations = [], generatedAt } = {}) {
  const extras = [
    ...buildCampaignPatternCards(events),
    buildReviewThemeCard(events, generatedAt || baseFeed.generated_at),
    buildCompetitorMovementCard(observations, peerObservations),
  ].filter(Boolean);

  const seen = new Set();
  const cards = [...(baseFeed.cards || []), ...extras].filter((c) => {
    const key = `${c.type}|${c.headline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const priority = { fix: 1, repeat: 2, test: 3, watch: 4 };
  cards.sort((a, b) => (priority[a.type] || 9) - (priority[b.type] || 9));
  return { ...baseFeed, cards: cards.slice(0, 9) };
}

export function buildWeeklyBrief(feed) {
  const cards = feed?.cards || [];
  const first = (type) => cards.find((c) => c.type === type) || null;
  const fix = first("fix");
  const repeat = first("repeat");
  const test = first("test");
  const watch = first("watch");
  return {
    generated_at: feed.generated_at,
    entity_key: feed.entity_key,
    headline: fix?.headline || repeat?.headline || "Keep measuring the same business outcomes",
    sections: {
      best_opportunity: fix,
      what_is_working: repeat,
      next_experiment: test,
      what_to_watch: watch,
    },
    evidence_summary: feed.summary,
  };
}
