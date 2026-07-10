import assert from "node:assert/strict";
import { buildEvidenceReadiness } from "../api/_readiness_intelligence.js";

const at = (day) => `2026-07-${String(day).padStart(2, "0")}T12:00:00Z`;
const observation = (metric, day, value = 1) => ({ metric, observed_at: at(day), value_numeric: value, source: "test", dimensions: {} });
const send = (id, channel = "sms", offer = "offer-a", group = "seasonal") => ({
  event_type: "campaign_sent",
  occurred_at: at(id),
  campaign_id: `c-${id}`,
  channel,
  offer_id: offer,
  creative_id: "staff-video",
  metadata: { comparison_group: group },
});
const outcome = (id) => ({ event_type: "booking_created", occurred_at: at(Math.min(28, id + 1)), campaign_id: `c-${id}`, value_numeric: 100, metadata: {} });
const review = (id, theme = "friendly staff") => ({ event_type: "review_received", occurred_at: at(id), metadata: { theme, sentiment: "positive", rating: 5 } });

// 1) Empty businesses are labeled not ready and do not claim supported intelligence.
{
  const r = buildEvidenceReadiness();
  assert.equal(r.status, "not_ready");
  assert.ok(r.score < 25);
  assert.ok(r.card);
  assert.ok(Object.values(r.ready_for).every((value) => value === false));
}

// 2) Three snapshots plus repeated check history unlock exact change intelligence.
{
  const observations = [
    observation("overall_score", 1, 60),
    observation("overall_score", 8, 64),
    observation("overall_score", 15, 66),
  ];
  for (let i = 0; i < 8; i += 1) {
    observations.push(observation(`check::quality::check-${i}`, 1, 0));
    observations.push(observation(`check::quality::check-${i}`, 15, 1));
  }
  const r = buildEvidenceReadiness({ observations });
  const change = r.dimensions.find((d) => d.key === "change_history");
  assert.equal(change.status, "ready");
  assert.equal(r.ready_for.exact_change_intelligence, true);
}

// 3) Campaign patterns require both campaign sample and linked outcomes.
{
  const events = [];
  for (let i = 1; i <= 6; i += 1) events.push(send(i));
  for (let i = 1; i <= 3; i += 1) events.push(outcome(i));
  const r = buildEvidenceReadiness({ events });
  const campaign = r.dimensions.find((d) => d.key === "campaign_sample");
  const linkage = r.dimensions.find((d) => d.key === "outcome_linkage");
  assert.notEqual(campaign.status, "not_ready");
  assert.notEqual(linkage.status, "not_ready");
  assert.equal(r.ready_for.campaign_pattern_intelligence, true);
}

// 4) Campaign sends without linked outcomes do not unlock campaign intelligence.
{
  const events = Array.from({ length: 12 }, (_, i) => send(i + 1, i % 2 ? "email" : "sms", "offer-a", `group-${i % 3}`));
  const r = buildEvidenceReadiness({ events });
  assert.equal(r.dimensions.find((d) => d.key === "campaign_sample").status, "ready");
  assert.equal(r.dimensions.find((d) => d.key === "outcome_linkage").status, "not_ready");
  assert.equal(r.ready_for.campaign_pattern_intelligence, false);
}

// 5) Consistently themed review evidence unlocks review-theme intelligence.
{
  const events = Array.from({ length: 5 }, (_, i) => review(i + 1));
  const r = buildEvidenceReadiness({ events });
  assert.notEqual(r.dimensions.find((d) => d.key === "review_signal").status, "not_ready");
  assert.equal(r.ready_for.review_theme_intelligence, true);
}

// 6) Medium peer confidence plus movement history unlocks competitor movement.
{
  const peerSet = { confidence: "medium", eligible_count: 4 };
  const peerObservations = [
    { entity_key: "peer-a.com" },
    { entity_key: "peer-b.com" },
    { entity_key: "peer-c.com" },
  ];
  const r = buildEvidenceReadiness({ peerSet, peerObservations });
  assert.equal(r.dimensions.find((d) => d.key === "peer_context").status, "ready");
  assert.equal(r.ready_for.competitor_movement_intelligence, true);
}

// 7) A measured recommendation unlocks closed-loop learning readiness.
{
  const insights = [{ status: "accepted" }, { status: "measured" }];
  const r = buildEvidenceReadiness({ insights });
  assert.equal(r.dimensions.find((d) => d.key === "learning_loop").status, "ready");
  assert.equal(r.ready_for.closed_loop_learning, true);
}

// 8) Readiness cards state clearly that readiness is not performance.
{
  const r = buildEvidenceReadiness();
  assert.match(r.card.evidence.caveat, /not business performance/i);
  assert.equal(r.card.evidence.source, "evidence_readiness");
}

console.log("Evidence readiness self-test passed: low-data honesty, change memory, campaign/outcome linkage, reviews, peers, and learning-loop readiness.");
