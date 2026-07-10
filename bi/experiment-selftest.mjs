import assert from "node:assert/strict";
import {
  experimentEventRow,
  foldExperiments,
  metricDefaultForCard,
  normalizeExperimentPlan,
  planFromCard,
  recommendationOutcomeFromCompletion,
} from "../api/_experiment_planner.js";

const basePlan = {
  hypothesis: "Tuesday SMS campaigns will increase completed bookings",
  primary_metric: "booking_created",
  baseline: "Wednesday send",
  variant: "Tuesday send",
  constants: "Keep audience, offer, budget, and creative constant.",
  min_observations: 6,
  measurement_days: 28,
  recommendation_headline: "Tuesday campaigns are outperforming Wednesday",
  insight_id: "123e4567-e89b-42d3-a456-426614174000",
};

// 1) Test cards receive sensible metric defaults from evidence source.
{
  assert.equal(metricDefaultForCard({ evidence: { source: "campaign_events" } }), "booking_created");
  assert.equal(metricDefaultForCard({ evidence: { source: "review_events" } }), "negative_review_theme_count");
  assert.equal(metricDefaultForCard({ evidence: { source: "scheduled_audit_refresh" } }), "overall_score");
  const plan = planFromCard({ headline: "Test Tuesday", recommendation: "Move one campaign", evidence: { source: "campaign_events" } });
  assert.equal(plan.primary_metric, "booking_created");
  assert.equal(plan.min_observations, 6);
  assert.equal(plan.measurement_days, 28);
}

// 2) A valid controlled plan normalizes cleanly.
{
  const plan = normalizeExperimentPlan(basePlan);
  assert.equal(plan.hypothesis, basePlan.hypothesis);
  assert.equal(plan.primary_metric, "booking_created");
  assert.equal(plan.min_observations, 6);
  assert.equal(plan.insight_id, basePlan.insight_id);
}

// 3) The planner rejects vague, identical, and underpowered plans.
{
  assert.throws(() => normalizeExperimentPlan({ ...basePlan, hypothesis: "Try it" }), /specific enough/i);
  assert.throws(() => normalizeExperimentPlan({ ...basePlan, variant: basePlan.baseline }), /must be different/i);
  assert.throws(() => normalizeExperimentPlan({ ...basePlan, min_observations: 3 }), /between 4 and 500/i);
  assert.throws(() => normalizeExperimentPlan({ ...basePlan, measurement_days: 181 }), /between 1 and 180 days/i);
}

// 4) Plan -> Start -> Complete folds into one completed experiment.
{
  const id = "exp-test-1";
  const planned = experimentEventRow({ entityKey: "example.com", experimentId: id, action: "plan", plan: basePlan, occurredAt: "2026-07-01T12:00:00Z" });
  const running = experimentEventRow({ entityKey: "example.com", experimentId: id, action: "start", plan: basePlan, occurredAt: "2026-07-02T12:00:00Z" });
  const completed = experimentEventRow({
    entityKey: "example.com", experimentId: id, action: "complete", plan: basePlan,
    occurredAt: "2026-07-30T12:00:00Z", completion: { result: "successful", measured_lift: 18.5, notes: "Bookings improved." },
  });
  const experiments = foldExperiments([completed, planned, running]);
  assert.equal(experiments.length, 1);
  assert.equal(experiments[0].status, "completed");
  assert.equal(experiments[0].result, "successful");
  assert.equal(experiments[0].measured_lift, 18.5);
  assert.equal(experiments[0].started_at, "2026-07-02T12:00:00.000Z");
}

// 5) Running and planned experiments stay distinct and active before completed history.
{
  const plannedA = experimentEventRow({ entityKey: "example.com", experimentId: "exp-a", action: "plan", plan: basePlan, occurredAt: "2026-07-01T12:00:00Z" });
  const plannedB = experimentEventRow({ entityKey: "example.com", experimentId: "exp-b", action: "plan", plan: basePlan, occurredAt: "2026-07-03T12:00:00Z" });
  const runningB = experimentEventRow({ entityKey: "example.com", experimentId: "exp-b", action: "start", plan: basePlan, occurredAt: "2026-07-04T12:00:00Z" });
  const folded = foldExperiments([plannedB, runningB, plannedA]);
  assert.deepEqual(folded.map((e) => e.status), ["planned", "running"]);
}

// 6) Completion requires an honest outcome label and preserves negative lift.
{
  assert.throws(() => experimentEventRow({ entityKey: "example.com", experimentId: "exp-x", action: "complete", plan: basePlan, completion: { result: "winner" } }), /must be successful/i);
  const row = experimentEventRow({ entityKey: "example.com", experimentId: "exp-x", action: "complete", plan: basePlan, completion: { result: "unsuccessful", measured_lift: -7.2 } });
  assert.equal(row.value_numeric, -7.2);
  assert.equal(row.metadata.result, "unsuccessful");
}

// 7) Linked experiment completion maps cleanly into recommendation outcome fields.
{
  const outcome = recommendationOutcomeFromCompletion(basePlan, { result: "inconclusive", measured_lift: "", notes: "Not enough separation." }, "2026-07-30T12:00:00Z");
  assert.equal(outcome.insight_id, basePlan.insight_id);
  assert.equal(outcome.result, "inconclusive");
  assert.equal(outcome.measured_lift, null);
  assert.equal(outcome.measurement_end, "2026-07-30T12:00:00.000Z");
}

console.log("Experiment Planner self-test passed: card defaults, plan validation, lifecycle folding, honest results, and recommendation outcome mapping.");
