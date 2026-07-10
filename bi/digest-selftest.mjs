import assert from "node:assert/strict";
import { buildOperatorDigest } from "../api/_operator_digest.js";

const result = (name, newInsights = [], extra = {}) => ({
  name,
  domain: `${name.toLowerCase().replace(/\s+/g, "")}.com`,
  created: newInsights.length,
  expired: 0,
  new_insights: newInsights,
  ...extra,
});
const insight = (type, headline, confidence = "medium") => ({ type, headline, confidence });

// 1) No meaningful change means no digest notification.
{
  const digest = buildOperatorDigest([
    result("Quiet Co", [], { unchanged: 3 }),
  ]);
  assert.equal(digest.should_notify, false);
  assert.equal(digest.created, 0);
  assert.equal(digest.errors, 0);
}

// 2) New recommendations trigger a digest and are ordered Fix -> Repeat -> Test.
{
  const digest = buildOperatorDigest([
    result("Beta Co", [insight("test", "Test Tuesday")]),
    result("Alpha Co", [insight("repeat", "Repeat staff video"), insight("fix", "Fix DMARC")]),
  ]);
  assert.equal(digest.should_notify, true);
  assert.equal(digest.created, 3);
  assert.deepEqual(digest.items.map((x) => x.type), ["fix", "repeat", "test"]);
  assert.match(digest.text, /Fix DMARC/);
  assert.match(digest.text, /Open Intelligence Portfolio/);
}

// 3) Expiry alone is meaningful and triggers a digest.
{
  const digest = buildOperatorDigest([
    result("Expired Co", [], { expired: 2 }),
  ]);
  assert.equal(digest.should_notify, true);
  assert.equal(digest.expired, 2);
  assert.match(digest.text, /2 expired/);
}

// 4) Refresh errors trigger a digest even without new recommendations.
{
  const digest = buildOperatorDigest([
    result("Broken Co", [], { error: "Supabase unavailable" }),
  ]);
  assert.equal(digest.should_notify, true);
  assert.equal(digest.errors, 1);
  assert.match(digest.text, /Refresh issues/);
  assert.match(digest.text, /Supabase unavailable/);
}

// 5) The digest shows at most five decision lines and summarizes the rest.
{
  const insights = Array.from({ length: 7 }, (_, i) => insight("test", `Test ${i + 1}`));
  const digest = buildOperatorDigest([result("Many Co", insights)]);
  assert.equal(digest.items.length, 7);
  assert.match(digest.text, /and 2 more new recommendations/);
  assert.ok(!digest.text.includes("Test 7 _"));
}

// 6) Custom site URL is used in the portfolio link.
{
  const digest = buildOperatorDigest([
    result("Action Co", [insight("fix", "Fix issue")]),
  ], { baseUrl: "https://example.test/" });
  assert.match(digest.text, /https:\/\/example\.test\/intelligence\/portfolio\//);
}

console.log("Operator digest self-test passed: quiet-day silence, priority ordering, expiry/error alerts, top-five limits, and portfolio links.");
