// Sightline Business Intelligence — transparent rules engine.
//
// V1 is intentionally deterministic: observations + events in, plain-English
// opportunity cards out. No LLM is required to produce or explain a claim.

const DAY_MS = 86_400_000;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value, max) {
  return max > 0 ? Math.round((num(value) / num(max)) * 100) : 0;
}

function iso(v) {
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function scanObservationRows(result, opts = {}) {
  const score = result?.score || {};
  const areas = score.areas || {};
  const maxes = score.maxes || {};
  const entityKey = opts.entityKey || result?.domain || "";
  const entityName = opts.entityName || entityKey;
  const observedAt = iso(opts.observedAt);
  const source = opts.source || "exposure_audit";

  if (!entityKey || !result?.ok || score.unreachable) return [];

  return [
    {
      entity_key: entityKey,
      entity_name: entityName,
      metric: "overall_score",
      value_numeric: num(score.overall),
      observed_at: observedAt,
      source,
      dimensions: { unit: "score", max: 100 },
    },
    {
      entity_key: entityKey,
      entity_name: entityName,
      metric: "security_score",
      value_numeric: pct(areas.security, maxes.security),
      observed_at: observedAt,
      source,
      dimensions: { unit: "percent", raw: num(areas.security), max: num(maxes.security) },
    },
    {
      entity_key: entityKey,
      entity_name: entityName,
      metric: "quality_score",
      value_numeric: pct(areas.quality, maxes.quality),
      observed_at: observedAt,
      source,
      dimensions: { unit: "percent", raw: num(areas.quality), max: num(maxes.quality) },
    },
    {
      entity_key: entityKey,
      entity_name: entityName,
      metric: "presence_score",
      value_numeric: pct(areas.presence, maxes.presence),
      observed_at: observedAt,
      source,
      dimensions: { unit: "percent", raw: num(areas.presence), max: num(maxes.presence) },
    },
  ];
}

function sortedMetric(observations, metric) {
  return observations
    .filter((o) => o.metric === metric && Number.isFinite(Number(o.value_numeric)))
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
}

function latestPair(observations, metric) {
  const rows = sortedMetric(observations, metric);
  if (rows.length < 2) return null;
  return { previous: rows[rows.length - 2], latest: rows[rows.length - 1], count: rows.length };
}

function latestValue(observations, metric) {
  const rows = sortedMetric(observations, metric);
  return rows.length ? rows[rows.length - 1] : null;
}

function confidence(sampleSize, high = 12, medium = 6) {
  if (sampleSize >= high) return "high";
  if (sampleSize >= medium) return "medium";
  return "low";
}

function card(type, headline, body, recommendation, evidence = {}) {
  return {
    type,
    headline,
    body,
    recommendation,
    evidence: {
      sample_size: evidence.sample_size ?? null,
      period_start: evidence.period_start || null,
      period_end: evidence.period_end || null,
      comparison: evidence.comparison || null,
      absolute_lift: evidence.absolute_lift ?? null,
      relative_lift: evidence.relative_lift ?? null,
      source: evidence.source || null,
    },
    confidence: evidence.confidence || "low",
  };
}

function buildScoreChangeCard(observations) {
  const pair = latestPair(observations, "overall_score");
  if (!pair) return null;
  const previous = num(pair.previous.value_numeric);
  const latest = num(pair.latest.value_numeric);
  const delta = latest - previous;
  const evidence = {
    sample_size: pair.count,
    period_start: pair.previous.observed_at,
    period_end: pair.latest.observed_at,
    comparison: `${previous}/100 → ${latest}/100`,
    absolute_lift: delta,
    source: pair.latest.source || "exposure_audit",
    confidence: confidence(pair.count, 8, 3),
  };

  if (delta >= 3) {
    return card(
      "repeat",
      `Your online health score improved ${delta} points`,
      `The latest measured audit moved from ${previous}/100 to ${latest}/100. That is a real improvement worth protecting.`,
      "Keep the change that preceded this improvement in place and continue measuring before changing several things at once.",
      evidence,
    );
  }
  if (delta <= -3) {
    return card(
      "fix",
      `Your online health score slipped ${Math.abs(delta)} points`,
      `The latest measured audit moved from ${previous}/100 to ${latest}/100. Something measurable changed and deserves a focused review.`,
      "Compare the failed checks between the last two audits and fix the highest-impact regression first.",
      evidence,
    );
  }
  return card(
    "watch",
    "Your overall score is stable",
    `The latest two measured audits are within ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} of each other. There is no meaningful score movement yet.`,
    "Keep watching the component scores and competitor movement instead of making changes just to move a dashboard number.",
    evidence,
  );
}

function buildWeakAreaCard(observations) {
  const areas = [
    ["security_score", "security"],
    ["quality_score", "website quality"],
    ["presence_score", "online presence"],
  ]
    .map(([metric, label]) => ({ metric, label, row: latestValue(observations, metric) }))
    .filter((x) => x.row)
    .map((x) => ({ ...x, value: num(x.row.value_numeric) }))
    .sort((a, b) => a.value - b.value);

  if (!areas.length || areas[0].value >= 70) return null;
  const weak = areas[0];
  return card(
    "fix",
    `${weak.label[0].toUpperCase() + weak.label.slice(1)} is the clearest current gap`,
    `The latest measured ${weak.label} score is ${weak.value}/100, lower than the other measured areas.`,
    `Work the failed ${weak.label} checks from highest impact to lowest, then re-scan before starting a second improvement track.`,
    {
      sample_size: sortedMetric(observations, weak.metric).length,
      period_end: weak.row.observed_at,
      comparison: areas.map((a) => `${a.label}: ${a.value}/100`).join(" · "),
      source: weak.row.source || "exposure_audit",
      confidence: "high",
    },
  );
}

function eventDay(event) {
  const stored = event.local_weekday;
  if (stored && DAY_NAMES.includes(stored)) return stored;
  const d = new Date(event.occurred_at);
  return Number.isNaN(d.getTime()) ? null : DAY_NAMES[d.getUTCDay()];
}

function comparisonKey(event) {
  const meta = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  if (meta.comparison_group) return String(meta.comparison_group);
  return `${event.channel || "unknown"}|${event.offer_id || "unspecified-offer"}`;
}

function timingCandidates(events) {
  const sent = events.filter((e) => e.event_type === "campaign_sent" && e.campaign_id);
  const outcomes = events.filter((e) => ["booking_created", "conversion", "sale_completed"].includes(e.event_type) && e.campaign_id);
  const outcomeByCampaign = new Map();
  for (const e of outcomes) {
    const rec = outcomeByCampaign.get(e.campaign_id) || { conversions: 0, value: 0 };
    rec.conversions += 1;
    rec.value += num(e.value_numeric);
    outcomeByCampaign.set(e.campaign_id, rec);
  }

  const groups = new Map();
  for (const s of sent) {
    const day = eventDay(s);
    if (!day) continue;
    const key = comparisonKey(s);
    if (!groups.has(key)) groups.set(key, new Map());
    const byDay = groups.get(key);
    const rec = byDay.get(day) || { day, campaigns: 0, converted_campaigns: 0, conversions: 0, value: 0, first: s.occurred_at, last: s.occurred_at };
    const out = outcomeByCampaign.get(s.campaign_id);
    rec.campaigns += 1;
    if (out?.conversions > 0) rec.converted_campaigns += 1;
    rec.conversions += out?.conversions || 0;
    rec.value += out?.value || 0;
    if (Date.parse(s.occurred_at) < Date.parse(rec.first)) rec.first = s.occurred_at;
    if (Date.parse(s.occurred_at) > Date.parse(rec.last)) rec.last = s.occurred_at;
    byDay.set(day, rec);
  }

  const candidates = [];
  for (const [key, byDay] of groups.entries()) {
    const eligible = [...byDay.values()]
      .filter((d) => d.campaigns >= 3)
      .map((d) => ({ ...d, rate: d.converted_campaigns / d.campaigns }))
      .sort((a, b) => b.rate - a.rate);
    if (eligible.length < 2) continue;
    const best = eligible[0];
    const worst = eligible[eligible.length - 1];
    const absolute = best.rate - worst.rate;
    const relative = worst.rate > 0 ? absolute / worst.rate : best.rate > 0 ? 1 : 0;
    const totalCampaigns = best.campaigns + worst.campaigns;
    const totalConversions = best.conversions + worst.conversions;
    if (absolute <= 0 || relative < 0.15 || totalConversions < 4) continue;
    candidates.push({ key, best, worst, absolute, relative, totalCampaigns, totalConversions });
  }
  return candidates.sort((a, b) => b.relative - a.relative);
}

function buildTimingCard(events) {
  const candidate = timingCandidates(events)[0];
  if (!candidate) return null;
  const { best, worst, absolute, relative, totalCampaigns, key } = candidate;
  const label = key.replace("|", " · ").replace("unspecified-offer", "comparable offer");
  return card(
    "test",
    `${best.day} campaigns are outperforming ${worst.day} in this comparison group`,
    `For ${label}, ${Math.round(best.rate * 1000) / 10}% of ${best.day} campaigns produced a conversion versus ${Math.round(worst.rate * 1000) / 10}% on ${worst.day}.`,
    `Move the next two comparable ${worst.day} campaigns to ${best.day}, keep the audience and offer as similar as possible, and measure the result.`,
    {
      sample_size: totalCampaigns,
      period_start: [best.first, worst.first].sort()[0],
      period_end: [best.last, worst.last].sort().reverse()[0],
      comparison: `${best.day} ${Math.round(best.rate * 1000) / 10}% vs ${worst.day} ${Math.round(worst.rate * 1000) / 10}%`,
      absolute_lift: Math.round(absolute * 1000) / 10,
      relative_lift: Math.round(relative * 100),
      source: "campaign_events",
      confidence: confidence(totalCampaigns, 20, 10),
    },
  );
}

function buildMeasurementTestCard(events) {
  const sent = events.filter((e) => e.event_type === "campaign_sent").length;
  return card(
    "test",
    sent ? "Keep building a comparable promotion sample" : "Start the evidence trail with the next promotion",
    sent
      ? `Sightline has ${sent} recorded campaign send${sent === 1 ? "" : "s"}, but not enough comparable outcomes yet to make a trustworthy timing recommendation.`
      : "There are not enough connected campaign and conversion events yet to compare days, channels, or offers honestly.",
    "Tag the next campaigns with channel, offer, campaign ID, local weekday, and the business outcome you care about. Sightline will wait for a repeatable pattern before recommending a change.",
    { sample_size: sent, source: "campaign_events", confidence: "low" },
  );
}

export function buildOpportunityFeed({ entityKey, observations = [], events = [], generatedAt = new Date().toISOString() }) {
  const cards = [];
  const scoreCard = buildScoreChangeCard(observations);
  const weakAreaCard = buildWeakAreaCard(observations);
  const timingCard = buildTimingCard(events);

  if (scoreCard) cards.push(scoreCard);
  if (weakAreaCard && !cards.some((c) => c.type === "fix")) cards.push(weakAreaCard);
  else if (weakAreaCard && scoreCard?.type !== "fix") cards.push(weakAreaCard);
  cards.push(timingCard || buildMeasurementTestCard(events));

  const hasWatch = cards.some((c) => c.type === "watch");
  if (!hasWatch && observations.length) {
    const latest = observations.slice().sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0];
    const ageDays = Math.floor((Date.parse(generatedAt) - Date.parse(latest.observed_at)) / DAY_MS);
    cards.push(card(
      "watch",
      ageDays > 14 ? "Your latest evidence is getting stale" : "Keep the next measurement comparable",
      ageDays > 14
        ? `The newest recorded observation is ${ageDays} days old. Recommendations weaken when the evidence stops updating.`
        : "The current signal is useful, but the next comparable observation will tell us whether it is a pattern or noise.",
      ageDays > 14 ? "Run a fresh scan and refresh competitor observations before making a major decision." : "Change one important variable at a time and keep measuring the same outcome.",
      { sample_size: observations.length, period_end: latest.observed_at, source: latest.source || null, confidence: ageDays > 14 ? "high" : "medium" },
    ));
  }

  if (!observations.length && !events.length) {
    cards.push(card(
      "watch",
      "No intelligence history yet",
      "The BI foundation is ready, but this business does not have historical observations or connected business events yet.",
      "Run the first scan, then keep collecting comparable observations. Connect campaign outcomes only when they can be tied to a clear business result.",
      { sample_size: 0, confidence: "high" },
    ));
  }

  const priority = { fix: 1, repeat: 2, test: 3, watch: 4 };
  cards.sort((a, b) => (priority[a.type] || 9) - (priority[b.type] || 9));

  return {
    generated_at: generatedAt,
    entity_key: entityKey,
    summary: {
      observation_count: observations.length,
      event_count: events.length,
      latest_observation_at: observations.length
        ? observations.slice().sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0].observed_at
        : null,
    },
    cards: cards.slice(0, 5),
  };
}
