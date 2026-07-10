import assert from "node:assert/strict";
import { buildOpportunityFeed, scanObservationRows } from "../api/_intelligence.js";
import {
  buildCampaignPatternCards,
  buildReviewThemeCard,
  buildCompetitorMovementCard,
  buildWeeklyBrief,
  enrichOpportunityFeed,
} from "../api/_bi_patterns.js";

function observation(metric, value, at, source = "test", entity_key = null) {
  return { metric, value_numeric: value, observed_at: at, source, dimensions: {}, ...(entity_key ? { entity_key } : {}) };
}

function campaign(id, day, channel = "sms", offer = "maintenance", creative = "staff-video") {
  return {
    event_type: "campaign_sent",
    occurred_at: `2026-06-${String(id).padStart(2, "0")}T15:00:00Z`,
    local_weekday: day,
    channel,
    offer_id: offer,
    creative_id: creative,
    campaign_id: `c-${id}`,
    metadata: {},
  };
}

function conversion(campaignId, n = 1) {
  return Array.from({ length: n }, (_, i) => ({
    event_type: "booking_created",
    occurred_at: `2026-06-25T16:0${i}:00Z`,
    campaign_id: campaignId,
    value_numeric: 100,
    metadata: {},
  }));
}

function review(theme, sentiment, at, rating = null) {
  return {
    event_type: "review_received",
    occurred_at: at,
    metadata: { theme, sentiment, rating },
  };
}

// 1) Audit results become normalized, immutable observations.
{
  const rows = scanObservationRows({
    ok: true,
    domain: "example.com",
    score: {
      overall: 72,
      areas: { security: 30, quality: 17, presence: 13 },
      maxes: { security: 40, quality: 34, presence: 26 },
    },
  }, { observedAt: "2026-06-01T00:00:00Z" });

  assert.equal(rows.length, 4);
  assert.equal(rows.find((r) => r.metric === "security_score").value_numeric, 75);
  assert.equal(rows.find((r) => r.metric === "quality_score").value_numeric, 50);
  assert.equal(rows.find((r) => r.metric === "presence_score").value_numeric, 50);
}

// 2) Low-data mode must be honest: no invented performance claim.
{
  const feed = buildOpportunityFeed({ entityKey: "empty.example", observations: [], events: [] });
  assert.ok(feed.cards.some((c) => c.type === "watch" && /No intelligence history/i.test(c.headline)));
  assert.ok(feed.cards.some((c) => c.type === "test" && /evidence trail/i.test(c.headline)));
  assert.ok(!feed.cards.some((c) => /outperforming/i.test(c.headline)));
}

// 3) Measured score movement and a weak area should create separate decision cards.
{
  const observations = [
    observation("overall_score", 61, "2026-06-01T00:00:00Z"),
    observation("overall_score", 69, "2026-06-15T00:00:00Z"),
    observation("security_score", 82, "2026-06-15T00:00:00Z"),
    observation("quality_score", 64, "2026-06-15T00:00:00Z"),
    observation("presence_score", 42, "2026-06-15T00:00:00Z"),
  ];
  const feed = buildOpportunityFeed({ entityKey: "moving.example", observations, events: [] });
  assert.ok(feed.cards.some((c) => c.type === "repeat" && /improved 8 points/i.test(c.headline)));
  assert.ok(feed.cards.some((c) => c.type === "fix" && /presence/i.test(c.headline)));
}

// 4) Timing intelligence requires comparable groups and enough outcomes.
{
  const sends = [
    campaign(1, "Tuesday"), campaign(2, "Tuesday"), campaign(3, "Tuesday"), campaign(4, "Tuesday"),
    campaign(5, "Wednesday"), campaign(6, "Wednesday"), campaign(7, "Wednesday"), campaign(8, "Wednesday"),
  ];
  const outcomes = [
    ...conversion("c-1"), ...conversion("c-2"), ...conversion("c-3"), ...conversion("c-4"),
    ...conversion("c-5"),
  ];
  const feed = buildOpportunityFeed({ entityKey: "timing.example", observations: [], events: [...sends, ...outcomes] });
  const timing = feed.cards.find((c) => c.type === "test" && /outperforming/i.test(c.headline));
  assert.ok(timing, "expected a timing insight");
  assert.match(timing.headline, /Tuesday campaigns are outperforming Wednesday/i);
  assert.equal(timing.evidence.sample_size, 8);
  assert.equal(timing.evidence.absolute_lift, 75);
}

// 5) Two campaigns per weekday is not enough to claim a timing winner.
{
  const sends = [campaign(1, "Tuesday"), campaign(2, "Tuesday"), campaign(3, "Wednesday"), campaign(4, "Wednesday")];
  const outcomes = [...conversion("c-1"), ...conversion("c-2")];
  const feed = buildOpportunityFeed({ entityKey: "small.example", observations: [], events: [...sends, ...outcomes] });
  assert.ok(!feed.cards.some((c) => /outperforming/i.test(c.headline)));
  assert.ok(feed.cards.some((c) => c.type === "test" && /comparable promotion sample/i.test(c.headline)));
}

// 6) Channel intelligence compares like offers and waits for repeated outcomes.
{
  const sends = [
    campaign(1, "Monday", "sms"), campaign(2, "Tuesday", "sms"), campaign(3, "Wednesday", "sms"), campaign(4, "Thursday", "sms"),
    campaign(5, "Monday", "email"), campaign(6, "Tuesday", "email"), campaign(7, "Wednesday", "email"), campaign(8, "Thursday", "email"),
  ];
  const outcomes = [
    ...conversion("c-1"), ...conversion("c-2"), ...conversion("c-3"), ...conversion("c-4"),
    ...conversion("c-5"),
  ];
  const cards = buildCampaignPatternCards([...sends, ...outcomes]);
  const channel = cards.find((c) => /SMS is outperforming EMAIL/i.test(c.headline));
  assert.ok(channel, "expected channel insight");
  assert.equal(channel.evidence.sample_size, 8);
  assert.equal(channel.evidence.absolute_lift, 75);
}

// 7) Emerging negative review themes require repeated recent evidence.
{
  const events = [
    review("wait time", "negative", "2026-06-10T12:00:00Z", 2),
    review("wait time", "negative", "2026-06-15T12:00:00Z", 2),
    review("wait time", "negative", "2026-06-20T12:00:00Z", 1),
    review("friendly staff", "positive", "2026-06-18T12:00:00Z", 5),
  ];
  const card = buildReviewThemeCard(events, "2026-07-01T00:00:00Z");
  assert.ok(card);
  assert.equal(card.type, "fix");
  assert.match(card.headline, /wait time/i);
}

// 8) Competitor movement is based on historical delta, not a one-time rank.
{
  const own = [
    observation("overall_score", 50, "2026-05-01T00:00:00Z"),
    observation("overall_score", 60, "2026-06-01T00:00:00Z"),
  ];
  const peers = [
    observation("overall_score", 60, "2026-05-01T00:00:00Z", "test", "peer-a.com"),
    observation("overall_score", 62, "2026-06-01T00:00:00Z", "test", "peer-a.com"),
    observation("overall_score", 70, "2026-05-01T00:00:00Z", "test", "peer-b.com"),
    observation("overall_score", 71, "2026-06-01T00:00:00Z", "test", "peer-b.com"),
  ];
  const card = buildCompetitorMovementCard(own, peers);
  assert.ok(card);
  assert.equal(card.type, "repeat");
  assert.match(card.headline, /gaining ground/i);
  assert.equal(card.confidence, "low");
}

// 9) Weekly Brief assembles one owner-facing decision per category.
{
  const base = buildOpportunityFeed({
    entityKey: "brief.example",
    observations: [
      observation("overall_score", 55, "2026-05-01T00:00:00Z"),
      observation("overall_score", 60, "2026-06-01T00:00:00Z"),
      observation("presence_score", 40, "2026-06-01T00:00:00Z"),
    ],
    events: [],
  });
  const feed = enrichOpportunityFeed(base, { observations: [], events: [], peerObservations: [] });
  const brief = buildWeeklyBrief(feed);
  assert.equal(brief.entity_key, "brief.example");
  assert.ok(brief.headline);
  assert.ok(brief.sections.best_opportunity || brief.sections.what_is_working);
}

console.log("BI self-test passed: observations, low-data honesty, timing, campaign comparisons, review themes, peer movement, and weekly brief assembly.");
