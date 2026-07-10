import assert from "node:assert/strict";
import { buildLearningMemory, learningCategory } from "../api/_learning_memory.js";

const insight = (id, headline, source = "campaign_events", extra = {}) => ({
  id,
  entity_key: "example.com",
  insight_type: "test",
  headline,
  confidence: "medium",
  evidence: { source },
  generated_at: `2026-07-${String(id).padStart(2, "0")}T12:00:00Z`,
  status: "measured",
  ...extra,
});
const outcome = (id, result, day, lift = null) => ({
  insight_id: id,
  accepted_at: `2026-07-0${Math.min(day, 9)}T12:00:00Z`,
  implemented_at: `2026-07-${String(Math.min(day + 1, 28)).padStart(2, "0")}T12:00:00Z`,
  measurement_start: `2026-07-${String(Math.min(day + 1, 28)).padStart(2, "0")}T12:00:00Z`,
  measurement_end: `2026-07-${String(day).padStart(2, "0")}T18:00:00Z`,
  result,
  measured_lift: lift,
  notes: `${result} notes`,
});

// 1) No measured outcomes means no memory claim.
{
  const memory = buildLearningMemory({ insights: [insight("1", "Test one")], outcomes: [] });
  assert.equal(memory.summary.measured, 0);
  assert.equal(memory.summary.success_rate, null);
  assert.equal(memory.card, null);
}

// 2) Two successful decisive results produce a positive trust card.
{
  const insights = [insight("1", "A"), insight("2", "B")];
  const outcomes = [outcome("1", "successful", 10, 18), outcome("2", "successful", 20, 12)];
  const memory = buildLearningMemory({ insights, outcomes });
  assert.equal(memory.summary.decisive, 2);
  assert.equal(memory.summary.success_rate, 100);
  assert.equal(memory.card.type, "repeat");
  assert.match(memory.card.headline, /earning trust/i);
}

// 3) Inconclusive results are measured but excluded from decisive success rate.
{
  const insights = [insight("1", "A"), insight("2", "B"), insight("3", "C")];
  const outcomes = [outcome("1", "successful", 10), outcome("2", "unsuccessful", 15), outcome("3", "inconclusive", 20)];
  const memory = buildLearningMemory({ insights, outcomes });
  assert.equal(memory.summary.measured, 3);
  assert.equal(memory.summary.decisive, 2);
  assert.equal(memory.summary.inconclusive, 1);
  assert.equal(memory.summary.success_rate, 50);
  assert.equal(memory.card.type, "watch");
  assert.match(memory.card.headline, /mixed/i);
}

// 4) Reversed outcomes count as decisive negative results.
{
  const insights = [insight("1", "A"), insight("2", "B")];
  const outcomes = [outcome("1", "successful", 10), outcome("2", "reversed", 20)];
  const memory = buildLearningMemory({ insights, outcomes });
  assert.equal(memory.summary.reversed, 1);
  assert.equal(memory.summary.decisive, 2);
  assert.equal(memory.summary.success_rate, 50);
}

// 5) Repeated inconclusive tests create a measurement-design Test card.
{
  const insights = [insight("1", "A"), insight("2", "B")];
  const outcomes = [outcome("1", "inconclusive", 10), outcome("2", "inconclusive", 20)];
  const memory = buildLearningMemory({ insights, outcomes });
  assert.equal(memory.summary.decisive, 0);
  assert.equal(memory.card.type, "test");
  assert.match(memory.card.headline, /inconclusive/i);
}

// 6) Recommendation categories are derived from evidence source, not headline wording.
{
  assert.equal(learningCategory(insight("1", "Anything", "campaign_events")), "campaign_performance");
  assert.equal(learningCategory(insight("2", "Anything", "review_events")), "reputation");
  assert.equal(learningCategory(insight("3", "Anything", "peer_movement")), "competitive_movement");
  assert.equal(learningCategory(insight("4", "Anything", "scheduled_audit_refresh")), "online_health");
}

// 7) Category summaries remain separate and average measured lift within category.
{
  const insights = [
    insight("1", "Campaign A", "campaign_events"),
    insight("2", "Campaign B", "campaign_events"),
    insight("3", "Review A", "review_events"),
  ];
  const outcomes = [outcome("1", "successful", 10, 20), outcome("2", "successful", 15, 10), outcome("3", "unsuccessful", 20, -5)];
  const memory = buildLearningMemory({ insights, outcomes });
  const campaign = memory.by_category.find((c) => c.category === "campaign_performance");
  const reputation = memory.by_category.find((c) => c.category === "reputation");
  assert.equal(campaign.average_measured_lift, 15);
  assert.equal(campaign.success_rate, 100);
  assert.equal(reputation.success_rate, 0);
}

// 8) Timeline is newest measured outcome first.
{
  const insights = [insight("1", "Older"), insight("2", "Newer")];
  const outcomes = [outcome("1", "successful", 10), outcome("2", "successful", 25)];
  const memory = buildLearningMemory({ insights, outcomes });
  assert.equal(memory.timeline[0].headline, "Newer");
  assert.equal(memory.timeline[1].headline, "Older");
}

console.log("Learning Memory self-test passed: decisive math, inconclusive separation, reversals, category memory, lift summaries, and timeline ordering.");
