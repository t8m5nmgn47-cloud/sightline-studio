import assert from "node:assert/strict";
import { buildAdminDashboard } from "../api/_admin_dashboard.js";

const generatedAt = "2026-07-10T18:00:00Z";
const dashboard = buildAdminDashboard({
  generatedAt,
  subscribers: [
    { status: "active", mo: 129.99, plan: "Front Door" },
    { status: "active", mo: 59.99, plan: "Site" },
    { status: "paused", mo: 199.99, plan: "Front Desk" },
    { status: "canceled", mo: 59.99, plan: "Site" },
  ],
  signups: [
    { status: "new", plan: "$59.99/mo · Site", created_at: "2026-07-10T12:00:00Z", name: "A" },
    { status: "contacted", plan: "$129.99/mo · Front Door", created_at: "2026-07-09T12:00:00Z", name: "B" },
    { status: "won", plan: "$199.99/mo · Front Desk", created_at: "2026-06-08T12:00:00Z", name: "C" },
    { status: "new", plan: "$59.99/mo · Site", created_at: "2026-05-25T12:00:00Z", name: "D" },
  ],
  leads: [
    { id: 1, created_at: "2026-07-10T10:00:00Z", name: "Lead A" },
    { id: 2, created_at: "2026-07-01T10:00:00Z", name: "Lead B" },
    { id: 3, created_at: "2026-05-20T10:00:00Z", name: "Lead C" },
  ],
  prospects: [
    { name: "Urgent Co", domain: "urgent.example", score: 48, updated_at: "2026-07-10T09:00:00Z" },
  ],
  observations: [
    { entity_key: "urgent.example", metric: "overall_score", value_numeric: 48, observed_at: "2026-07-10T09:00:00Z" },
  ],
  events: [
    { event_type: "campaign_sent", entity_key: "urgent.example", campaign_id: "c1", channel: "sms", occurred_at: "2026-07-01T12:00:00Z", metadata: { spend: 100, audience_size: 1000 } },
    { event_type: "campaign_sent", entity_key: "urgent.example", campaign_id: "c2", channel: "email", occurred_at: "2026-07-02T12:00:00Z", metadata: { spend: 50, audience_size: 1200 } },
    { event_type: "campaign_result", entity_key: "urgent.example", campaign_id: "c2", occurred_at: "2026-07-03T12:00:00Z", value_numeric: 500, metadata: { bookings: 4 } },
  ],
  insights: [
    { entity_key: "urgent.example", status: "accepted", headline: "Fix issue", generated_at: "2026-07-08T12:00:00Z" },
    { entity_key: "urgent.example", status: "accepted", headline: "Test offer", generated_at: "2026-07-07T12:00:00Z" },
    { entity_key: "urgent.example", status: "measured", headline: "Repeat channel", generated_at: "2026-07-06T12:00:00Z" },
  ],
  outcomes: [
    { result: "successful", measured_lift: 18, measurement_end: "2026-07-09T12:00:00Z" },
    { result: "unsuccessful", measured_lift: -4, measurement_end: "2026-07-08T12:00:00Z" },
    { result: "inconclusive", measured_lift: 1, measurement_end: "2026-07-07T12:00:00Z" },
  ],
  portfolio: {
    summary: {
      tracked_businesses: 5,
      attention: 1,
      refresh_evidence: 2,
      measure_recommendation: 1,
      build_evidence: 0,
      intelligence_ready: 1,
      monitor: 0,
    },
    rows: [
      {
        name: "Urgent Co",
        domain: "urgent.example",
        vertical: "accounting",
        bucket: "attention",
        reason: "Security header regressed",
        next_action: "Restore the missing security header.",
        current_score: 48,
        urgency: 90,
        readiness_score: 72,
        stale_days: 0,
        peer_confidence: "medium",
      },
      {
        name: "Ready Co",
        domain: "ready.example",
        vertical: "services",
        bucket: "intelligence_ready",
        reason: "Evidence readiness is 82/100",
        next_action: "Review the Opportunity Feed.",
        current_score: 88,
        urgency: 8,
        readiness_score: 82,
        stale_days: 1,
        peer_confidence: "high",
      },
    ],
  },
});

assert.equal(Math.round(dashboard.kpis.mrr * 100), 18998);
assert.equal(Math.round(dashboard.kpis.arr * 100), 227976);
assert.equal(Math.round(dashboard.kpis.arpa * 100), 9499);
assert.equal(dashboard.kpis.active_subscribers, 2);
assert.equal(dashboard.kpis.paused_subscribers, 1);
assert.equal(dashboard.kpis.canceled_subscribers, 1);
assert.equal(dashboard.kpis.open_opportunities, 2);
assert.equal(Math.round(dashboard.kpis.pipeline_mrr * 100), 18998);
assert.equal(dashboard.kpis.lead_signals, 3);
assert.equal(dashboard.kpis.lead_signals_30d, 2);
assert.equal(dashboard.kpis.tracked_businesses, 5);
assert.equal(dashboard.kpis.attention, 1);
assert.equal(dashboard.kpis.pending_campaign_results, 1);
assert.equal(dashboard.kpis.accepted_recommendations, 2);
assert.equal(dashboard.kpis.measured_recommendations, 1);

assert.equal(dashboard.pipeline.stages.new, 2);
assert.equal(dashboard.pipeline.stages.contacted, 1);
assert.equal(dashboard.pipeline.stages.won, 1);
assert.equal(dashboard.pipeline.signup_30d.current, 2);
assert.equal(dashboard.pipeline.lead_30d.current, 2);

assert.equal(dashboard.campaigns.campaigns, 2);
assert.equal(dashboard.campaigns.results_recorded, 1);
assert.equal(dashboard.campaigns.pending_results, 1);
assert.equal(dashboard.campaigns.result_coverage_percent, 50);
assert.equal(dashboard.campaigns.revenue_recorded, 500);
assert.equal(dashboard.campaigns.recorded_spend, 50);
assert.equal(dashboard.campaigns.contribution_after_recorded_spend, 450);
assert.equal(dashboard.campaigns.conversions_recorded, 4);

assert.equal(dashboard.learning.outcomes.successful, 1);
assert.equal(dashboard.learning.outcomes.unsuccessful, 1);
assert.equal(dashboard.learning.outcomes.inconclusive, 1);
assert.equal(dashboard.learning.outcomes.decisive, 2);
assert.equal(dashboard.learning.outcomes.success_rate, 50);
assert.equal(dashboard.learning.outcomes.average_measured_lift, 5);

assert.equal(dashboard.intelligence.average_readiness, 77);
assert.equal(dashboard.intelligence.average_score, 68);
assert.equal(dashboard.priorities[0].type, "attention");
assert.equal(dashboard.priorities[1].type, "results");
assert.equal(dashboard.priorities[2].type, "measure");
assert.equal(dashboard.focus.headline, "Urgent Co needs attention");
assert.ok(dashboard.activity.length > 0);
assert.equal(dashboard.system_health.length, 4);

console.log("Admin command-center self-test passed: revenue, velocity, campaign economics, learning memory, triage, and activity are correct.");
