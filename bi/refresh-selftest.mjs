import assert from "node:assert/strict";
import { actionableCards, insightRow, planInsightRefresh } from "../api/_insight_refresh.js";

const at = "2026-07-30T12:00:00Z";
const card = (type, headline, source = "campaign_events") => ({
  type,
  headline,
  body: `${headline} body`,
  recommendation: `${headline} recommendation`,
  confidence: "medium",
  evidence: { source, comparison: "A vs B" },
});

// 1) Only actionable decision cards are persisted; Watch and readiness housekeeping stay live.
{
  const feed = {
    cards: [
      card("fix", "Fix regression"),
      card("repeat", "Repeat winner"),
      card("test", "Run timing test"),
      card("watch", "Keep watching"),
      card("test", "Next evidence unlock", "evidence_readiness"),
    ],
  };
  assert.deepEqual(actionableCards(feed).map((c) => c.headline), ["Fix regression", "Repeat winner", "Run timing test"]);
}

// 2) Existing active headlines are unchanged rather than duplicated.
{
  const feed = { cards: [card("fix", "Fix regression"), card("test", "Run timing test")] };
  const existing = [{ id: "1", headline: "Fix regression", status: "active", generated_at: "2026-07-29T12:00:00Z" }];
  const plan = planInsightRefresh({ entityKey: "example.com", feed, existing, generatedAt: at });
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].headline, "Run timing test");
  assert.deepEqual(plan.unchanged, ["Fix regression"]);
}

// 3) Recently missing active cards are not expired immediately.
{
  const existing = [{ id: "recent", headline: "Old card", status: "active", generated_at: "2026-07-20T12:00:00Z" }];
  const plan = planInsightRefresh({ entityKey: "example.com", feed: { cards: [] }, existing, generatedAt: at, expireAfterDays: 21 });
  assert.deepEqual(plan.expire, []);
}

// 4) Active cards absent from the live feed for more than the grace window expire.
{
  const existing = [{ id: "old", headline: "Old card", status: "active", generated_at: "2026-06-01T12:00:00Z" }];
  const plan = planInsightRefresh({ entityKey: "example.com", feed: { cards: [] }, existing, generatedAt: at, expireAfterDays: 21 });
  assert.deepEqual(plan.expire, ["old"]);
}

// 5) Accepted or measured insights are never expired by the scheduled refresh.
{
  const existing = [
    { id: "accepted", headline: "Accepted", status: "accepted", generated_at: "2026-06-01T12:00:00Z" },
    { id: "measured", headline: "Measured", status: "measured", generated_at: "2026-06-01T12:00:00Z" },
  ];
  const plan = planInsightRefresh({ entityKey: "example.com", feed: { cards: [] }, existing, generatedAt: at });
  assert.deepEqual(plan.expire, []);
}

// 6) Stored rows keep evidence and receive a 14-day review date.
{
  const row = insightRow("example.com", card("fix", "Fix regression"), at);
  assert.equal(row.entity_key, "example.com");
  assert.equal(row.insight_type, "fix");
  assert.equal(row.status, "active");
  assert.equal(row.evidence.source, "campaign_events");
  assert.equal(row.review_after, "2026-08-13T12:00:00.000Z");
}

// 7) Duplicate headlines inside one live feed are collapsed before planning.
{
  const feed = { cards: [card("fix", "Same headline"), card("fix", "Same headline"), card("test", "Different")] };
  const plan = planInsightRefresh({ entityKey: "example.com", feed, existing: [], generatedAt: at });
  assert.equal(plan.create.length, 2);
  assert.deepEqual(plan.create.map((r) => r.headline), ["Same headline", "Different"]);
}

console.log("Scheduled insight refresh self-test passed: actionability filtering, dedupe, grace expiry, workflow protection, and review dates.");
