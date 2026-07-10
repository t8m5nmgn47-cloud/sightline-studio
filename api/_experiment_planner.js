// Controlled experiment planning for Sightline BI.
// Experiments are stored as events on the existing BI event spine.

const RESULT_SET = new Set(["successful", "inconclusive", "unsuccessful", "reversed"]);
const STATUS_ORDER = { planned: 1, running: 2, completed: 3 };

function text(v, max = 1000) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function integer(v, fallback) {
  const n = Number(v);
  return Number.isInteger(n) ? n : fallback;
}

function numberOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function metricDefaultForCard(card = {}) {
  const source = String(card?.evidence?.source || "").toLowerCase();
  if (source === "campaign_events") return "booking_created";
  if (source === "review_events") return "negative_review_theme_count";
  if (source === "peer_movement") return "overall_score";
  if (/audit|scan/.test(source)) return "overall_score";
  return "conversion";
}

export function planFromCard(card = {}) {
  return {
    hypothesis: text(card.headline, 500),
    primary_metric: metricDefaultForCard(card),
    baseline: "Current approach",
    variant: text(card.recommendation, 500) || "Recommended change",
    constants: "Keep audience, offer, budget, and measurement method as similar as possible except for the tested variable.",
    min_observations: 6,
    measurement_days: 28,
    recommendation_headline: text(card.headline, 500),
  };
}

export function normalizeExperimentPlan(input = {}) {
  const plan = {
    hypothesis: text(input.hypothesis, 500),
    primary_metric: text(input.primary_metric, 120),
    baseline: text(input.baseline, 500),
    variant: text(input.variant, 500),
    constants: text(input.constants, 1500),
    min_observations: integer(input.min_observations, 6),
    measurement_days: integer(input.measurement_days, 28),
    recommendation_headline: text(input.recommendation_headline, 500) || null,
    insight_id: text(input.insight_id, 80) || null,
  };

  if (plan.hypothesis.length < 8) throw new Error("Experiment hypothesis must be specific enough to test.");
  if (!plan.primary_metric) throw new Error("Choose one primary metric.");
  if (!plan.baseline || !plan.variant) throw new Error("Define both the baseline and the variant.");
  if (plan.baseline.toLowerCase() === plan.variant.toLowerCase()) throw new Error("Baseline and variant must be different.");
  if (!plan.constants) throw new Error("List the conditions that should stay constant.");
  if (plan.min_observations < 4 || plan.min_observations > 500) throw new Error("Minimum observations must be between 4 and 500.");
  if (plan.measurement_days < 1 || plan.measurement_days > 180) throw new Error("Measurement window must be between 1 and 180 days.");
  return plan;
}

export function experimentEventRow({ entityKey, experimentId, action, plan = {}, occurredAt = new Date().toISOString(), completion = {} }) {
  const status = action === "plan" ? "planned" : action === "start" ? "running" : action === "complete" ? "completed" : null;
  if (!status) throw new Error("Unsupported experiment action.");
  if (!entityKey || !experimentId) throw new Error("Experiment event needs an entity and experiment ID.");

  const metadata = {
    experiment_id: experimentId,
    status,
    hypothesis: plan.hypothesis || null,
    primary_metric: plan.primary_metric || null,
    baseline: plan.baseline || null,
    variant: plan.variant || null,
    constants: plan.constants || null,
    min_observations: plan.min_observations ?? null,
    measurement_days: plan.measurement_days ?? null,
    recommendation_headline: plan.recommendation_headline || null,
    insight_id: plan.insight_id || null,
  };

  let valueNumeric = null;
  if (status === "completed") {
    const result = text(completion.result, 30);
    if (!RESULT_SET.has(result)) throw new Error("Experiment result must be successful, inconclusive, unsuccessful, or reversed.");
    const measuredLift = numberOrNull(completion.measured_lift);
    metadata.result = result;
    metadata.measured_lift = measuredLift;
    metadata.notes = text(completion.notes, 3000) || null;
    valueNumeric = measuredLift;
  }

  return {
    entity_key: entityKey,
    event_type: `experiment_${status}`,
    occurred_at: new Date(occurredAt).toISOString(),
    channel: "experiment",
    campaign_id: experimentId,
    value_numeric: valueNumeric,
    metadata,
  };
}

export function foldExperiments(events = []) {
  const groups = new Map();
  for (const event of events) {
    if (!String(event.event_type || "").startsWith("experiment_")) continue;
    const id = event.campaign_id || event.metadata?.experiment_id;
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(event);
  }

  const experiments = [];
  for (const [id, rows] of groups.entries()) {
    rows.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
    const planned = rows.find((row) => row.event_type === "experiment_planned") || rows[0];
    const latest = rows[rows.length - 1];
    const status = latest.event_type === "experiment_completed"
      ? "completed"
      : rows.some((row) => row.event_type === "experiment_running")
        ? "running"
        : "planned";
    const plan = planned.metadata || {};
    const completion = rows.findLast ? rows.findLast((row) => row.event_type === "experiment_completed") : rows.slice().reverse().find((row) => row.event_type === "experiment_completed");
    experiments.push({
      experiment_id: id,
      status,
      status_order: STATUS_ORDER[status],
      hypothesis: plan.hypothesis || latest.metadata?.hypothesis || null,
      primary_metric: plan.primary_metric || latest.metadata?.primary_metric || null,
      baseline: plan.baseline || latest.metadata?.baseline || null,
      variant: plan.variant || latest.metadata?.variant || null,
      constants: plan.constants || latest.metadata?.constants || null,
      min_observations: plan.min_observations ?? null,
      measurement_days: plan.measurement_days ?? null,
      recommendation_headline: plan.recommendation_headline || null,
      insight_id: plan.insight_id || null,
      planned_at: planned.occurred_at,
      started_at: rows.find((row) => row.event_type === "experiment_running")?.occurred_at || null,
      completed_at: completion?.occurred_at || null,
      result: completion?.metadata?.result || null,
      measured_lift: numberOrNull(completion?.metadata?.measured_lift ?? completion?.value_numeric),
      notes: completion?.metadata?.notes || null,
    });
  }

  return experiments.sort((a, b) => {
    if (a.status_order !== b.status_order) return a.status_order - b.status_order;
    return Date.parse(b.planned_at || 0) - Date.parse(a.planned_at || 0);
  });
}

export function recommendationOutcomeFromCompletion(plan = {}, completion = {}, occurredAt = new Date().toISOString()) {
  const result = text(completion.result, 30);
  if (!RESULT_SET.has(result)) throw new Error("Invalid experiment result.");
  return {
    insight_id: plan.insight_id || null,
    measurement_end: new Date(occurredAt).toISOString(),
    result,
    measured_lift: numberOrNull(completion.measured_lift),
    notes: text(completion.notes, 3000) || null,
  };
}
