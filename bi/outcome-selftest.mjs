import assert from "node:assert/strict";
import {
  campaignCompletionEvents,
  foldCampaignOutcomeQueue,
  validateCampaignCompletion,
} from "../api/_campaign_outcomes.js";

function send(id, day = 1) {
  return {
    entity_key: "example.com",
    event_type: "campaign_sent",
    occurred_at: `2026-07-${String(day).padStart(2, "0")}T12:00:00Z`,
    campaign_id: id,
    channel: "sms",
    offer_id: "offer-a",
    creative_id: "staff-video",
    metadata: {
      campaign_name: `Campaign ${id}`,
      comparison_group: "summer",
      audience_size: 1000,
      spend: 100,
    },
  };
}

function result(id, revenue, bookings, day = 10) {
  return {
    entity_key: "example.com",
    event_type: "campaign_result",
    occurred_at: `2026-07-${String(day).padStart(2, "0")}T12:00:00Z`,
    campaign_id: id,
    value_numeric: revenue,
    metadata: { bookings, results_finalized: true },
  };
}

// 1) A send without a finalized result remains pending.
{
  const queue = foldCampaignOutcomeQueue([send("c-1")]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].status, "pending");
  assert.equal(queue[0].bookings, null);
  assert.equal(queue[0].revenue, null);
}

// 2) Finalized zero is a real finalized result, not missing data.
{
  const queue = foldCampaignOutcomeQueue([send("c-1"), result("c-1", 0, 0)]);
  assert.equal(queue[0].status, "finalized");
  assert.equal(queue[0].bookings, 0);
  assert.equal(queue[0].revenue, 0);
}

// 3) Pending campaigns sort before finalized campaigns, newest pending first.
{
  const queue = foldCampaignOutcomeQueue([
    send("old-pending", 1),
    send("finalized", 2), result("finalized", 500, 2, 5),
    send("new-pending", 8),
  ]);
  assert.deepEqual(queue.map((row) => row.campaign_id), ["new-pending", "old-pending", "finalized"]);
}

// 4) Every completion emits campaign_result; positive bookings also emit booking_created.
{
  const campaign = { ...foldCampaignOutcomeQueue([send("c-1")])[0], entity_key: "example.com" };
  const events = campaignCompletionEvents(campaign, { bookings: 3, revenue: 900, notes: "Three jobs booked." }, "2026-07-20T12:00:00Z");
  assert.deepEqual(events.map((event) => event.event_type), ["campaign_result", "booking_created"]);
  assert.equal(events[0].value_numeric, 900);
  assert.equal(events[0].metadata.bookings, 3);
  assert.equal(events[1].metadata.count, 3);
}

// 5) Revenue with zero bookings emits a sale_completed event.
{
  const campaign = { ...foldCampaignOutcomeQueue([send("c-2")])[0], entity_key: "example.com" };
  const events = campaignCompletionEvents(campaign, { bookings: 0, revenue: 250 }, "2026-07-20T12:00:00Z");
  assert.deepEqual(events.map((event) => event.event_type), ["campaign_result", "sale_completed"]);
  assert.equal(events[1].value_numeric, 250);
}

// 6) Honest zero emits only campaign_result.
{
  const campaign = { ...foldCampaignOutcomeQueue([send("c-3")])[0], entity_key: "example.com" };
  const events = campaignCompletionEvents(campaign, { bookings: 0, revenue: 0 }, "2026-07-20T12:00:00Z");
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, "campaign_result");
  assert.equal(events[0].value_numeric, 0);
}

// 7) A finalized campaign cannot be completed twice.
{
  const campaign = { ...foldCampaignOutcomeQueue([send("c-4"), result("c-4", 500, 2)])[0], entity_key: "example.com" };
  assert.throws(
    () => campaignCompletionEvents(campaign, { bookings: 2, revenue: 500 }),
    /already finalized/i,
  );
}

// 8) Invalid negative revenue and fractional bookings are rejected.
{
  assert.throws(() => validateCampaignCompletion({ bookings: 1, revenue: -1 }), /Revenue must be zero or more/i);
  assert.throws(() => validateCampaignCompletion({ bookings: 1.5, revenue: 100 }), /whole number/i);
  assert.throws(() => validateCampaignCompletion({ bookings: -1, revenue: 100 }), /whole number/i);
}

// 9) Multiple result events fold to the newest recorded result defensively.
{
  const queue = foldCampaignOutcomeQueue([
    send("c-5"),
    result("c-5", 100, 1, 10),
    result("c-5", 300, 2, 12),
  ]);
  assert.equal(queue[0].revenue, 300);
  assert.equal(queue[0].bookings, 2);
  assert.equal(queue[0].finalized_at, "2026-07-12T12:00:00Z");
}

console.log("Outcome completion self-test passed: pending-vs-zero honesty, queue ordering, completion bundles, exact-once finalization, validation, and defensive folding.");
