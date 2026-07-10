import assert from "node:assert/strict";
import { buildCampaignEconomics, campaignEconomicRows } from "../api/_campaign_economics.js";

function send(id, channel, offer = "offer-a", group = "summer", spend = 100, audience = 1000) {
  return { event_type: "campaign_sent", occurred_at: `2026-07-${String(id).padStart(2, "0")}T12:00:00Z`, campaign_id: `c-${id}`, channel, offer_id: offer, creative_id: "creative-a", metadata: { comparison_group: group, spend, audience_size: audience } };
}
function result(id, revenue, bookings = 0) {
  return { event_type: "campaign_result", occurred_at: `2026-07-${String(Math.min(id + 1, 28)).padStart(2, "0")}T12:00:00Z`, campaign_id: `c-${id}`, value_numeric: revenue, metadata: { bookings, results_finalized: true } };
}

{
  const rows = campaignEconomicRows([send(1, "sms"), send(2, "sms"), result(2, 0, 0)]);
  const pending = rows.find((r) => r.campaign_id === "c-1");
  const zero = rows.find((r) => r.campaign_id === "c-2");
  assert.equal(pending.results_recorded, false);
  assert.equal(pending.revenue, null);
  assert.equal(zero.results_recorded, true);
  assert.equal(zero.revenue, 0);
  assert.equal(zero.conversions, 0);
}

{
  const events = [];
  for (let i = 1; i <= 3; i += 1) events.push(send(i, "sms", "same-offer", "same-group", 100, 1000), result(i, 1000, 1));
  for (let i = 4; i <= 6; i += 1) events.push(send(i, "email", "same-offer", "same-group", 100, 1000), result(i, 400, 4));
  const economics = buildCampaignEconomics(events);
  const revenueCard = economics.cards.find((c) => /recorded revenue per campaign/i.test(c.headline));
  assert.ok(revenueCard);
  assert.match(revenueCard.headline, /SMS.*EMAIL/i);
  assert.match(revenueCard.body, /\$1,000/);
}

{
  const economics = buildCampaignEconomics([send(1, "sms", "offer-a", "g", null, 1000), result(1, 500, 2)]);
  assert.equal(economics.rows[0].contribution, null);
  assert.equal(economics.summary.spend_recorded, 0);
  assert.ok(!economics.cards.some((c) => /contribution after recorded campaign spend/i.test(c.headline)));
}

{
  const row = campaignEconomicRows([send(1, "sms", "offer-a", "g", 300, 1000), result(1, 250, 1)])[0];
  assert.equal(row.contribution, -50);
  assert.equal(row.cost_per_outcome, 300);
}

{
  const events = [];
  for (let i = 1; i <= 2; i += 1) events.push(send(i, "sms", "same-offer", "same-group", 100, 1000), result(i, 1000, 2));
  for (let i = 3; i <= 4; i += 1) events.push(send(i, "email", "same-offer", "same-group", 100, 1000), result(i, 200, 2));
  assert.equal(buildCampaignEconomics(events).cards.length, 0);
}

{
  const events = [];
  for (let i = 1; i <= 3; i += 1) events.push(send(i, "sms", "same-offer", "same-group", 100, 1000), result(i, 900, 2));
  for (let i = 4; i <= 6; i += 1) events.push(send(i, "email", "same-offer", "same-group", 500, 1000), result(i, 700, 3));
  const card = buildCampaignEconomics(events).cards.find((c) => /contribution after recorded campaign spend/i.test(c.headline));
  assert.ok(card);
  assert.ok(!/profit/i.test(card.headline));
  assert.match(card.evidence.caveat, /not gross profit/i);
}

{
  const rows = campaignEconomicRows([send(1, "sms", "offer", "g", 50, 1000), result(1, 500, 2), send(2, "email", "offer", "g", 50, null), result(2, 500, 2)]);
  assert.equal(rows.find((r) => r.campaign_id === "c-1").revenue_per_recipient, 0.5);
  assert.equal(rows.find((r) => r.campaign_id === "c-2").revenue_per_recipient, null);
}

console.log("Campaign economics self-test passed: pending-vs-zero honesty, revenue value, spend coverage, negative contribution, sample thresholds, non-profit labeling, and audience normalization.");
