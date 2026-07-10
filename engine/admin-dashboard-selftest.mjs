import assert from "node:assert/strict";
import { buildAdminDashboard } from "../api/_admin_dashboard.js";

const dashboard = buildAdminDashboard({
  subscribers: [
    { status: "active", mo: 129.99 },
    { status: "active", mo: 59.99 },
    { status: "paused", mo: 199.99 },
    { status: "canceled", mo: 59.99 },
  ],
  signups: [
    { status: "new", plan: "$59.99/mo · Site", created_at: "2026-07-10T12:00:00Z", name: "A" },
    { status: "contacted", plan: "$129.99/mo · Front Door", created_at: "2026-07-09T12:00:00Z", name: "B" },
    { status: "won", plan: "$199.99/mo · Front Desk", created_at: "2026-07-08T12:00:00Z", name: "C" },
  ],
  leads: [{ id: 1 }, { id: 2 }, { id: 3 }],
  events: [
    { event_type: "campaign_sent", campaign_id: "c1", occurred_at: "2026-07-01T12:00:00Z" },
    { event_type: "campaign_sent", campaign_id: "c2", occurred_at: "2026-07-02T12:00:00Z" },
    { event_type: "campaign_result", campaign_id: "c2", occurred_at: "2026-07-03T12:00:00Z" },
  ],
  insights: [
    { status: "accepted" },
    { status: "accepted" },
    { status: "measured" },
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
        bucket: "attention",
        reason: "Security header regressed",
        next_action: "Restore the missing security header.",
        current_score: 48,
        urgency: 90,
        readiness_score: 72,
      },
    ],
  },
});

assert.equal(Math.round(dashboard.kpis.mrr * 100), 18998);
assert.equal(dashboard.kpis.active_subscribers, 2);
assert.equal(dashboard.kpis.paused_subscribers, 1);
assert.equal(dashboard.kpis.canceled_subscribers, 1);
assert.equal(dashboard.kpis.open_opportunities, 2);
assert.equal(Math.round(dashboard.kpis.pipeline_mrr * 100), 18998);
assert.equal(dashboard.kpis.lead_signals, 3);
assert.equal(dashboard.kpis.tracked_businesses, 5);
assert.equal(dashboard.kpis.attention, 1);
assert.equal(dashboard.kpis.pending_campaign_results, 1);
assert.equal(dashboard.kpis.accepted_recommendations, 2);
assert.equal(dashboard.kpis.measured_recommendations, 1);
assert.equal(dashboard.pipeline.stages.new, 1);
assert.equal(dashboard.pipeline.stages.contacted, 1);
assert.equal(dashboard.pipeline.stages.won, 1);
assert.equal(dashboard.priorities[0].type, "attention");
assert.equal(dashboard.priorities[1].type, "measure");
assert.equal(dashboard.priorities[2].type, "results");
assert.equal(dashboard.priorities[3].type, "pipeline");

console.log("Admin dashboard self-test passed: operating KPIs, pending outcomes, and priority ordering are correct.");
