import assert from "node:assert/strict";
import { buildPortfolioTriage } from "../api/_portfolio_intelligence.js";

const generatedAt = "2026-07-30T12:00:00Z";
const obs = (entity, metric, value, at, dimensions = {}) => ({ entity_key: entity, metric, value_numeric: value, observed_at: at, source: "test", dimensions });
const event = (entity, type, campaignId, at, extra = {}) => ({ entity_key: entity, event_type: type, campaign_id: campaignId, occurred_at: at, metadata: {}, ...extra });
const prospect = (domain, name, updatedAt = "2026-07-29T12:00:00Z", extra = {}) => ({ slug: domain.split(".")[0], name, domain, vertical: "Dental practice", score: 75, updated_at: updatedAt, competitors: [], ...extra });

// 1) Exact regressions route a business to Attention and outrank generic evidence work.
{
  const domain = "regression.example";
  const observations = [
    obs(domain, "overall_score", 72, "2026-07-20T12:00:00Z"),
    obs(domain, "check::security::dmarc-record-present", 1, "2026-07-20T12:00:00Z", { label: "DMARC record present", area: "security", points: 5 }),
    obs(domain, "check::security::dmarc-record-present", 0, "2026-07-29T12:00:00Z", { label: "DMARC record present", area: "security", points: 5, note: "no record" }),
  ];
  const portfolio = buildPortfolioTriage({ prospects: [prospect(domain, "Regression Co")], observations, generatedAt });
  assert.equal(portfolio.rows[0].bucket, "attention");
  assert.match(portfolio.rows[0].reason, /DMARC record present regressed/i);
  assert.ok(portfolio.rows[0].urgency >= 25);
}

// 2) Stale evidence routes to Refresh Evidence before generic low-readiness work.
{
  const domain = "stale.example";
  const portfolio = buildPortfolioTriage({
    prospects: [prospect(domain, "Stale Co", "2026-05-01T12:00:00Z")],
    generatedAt,
  });
  assert.equal(portfolio.rows[0].bucket, "refresh_evidence");
  assert.match(portfolio.rows[0].reason, /days old/i);
}

// 3) Accepted recommendations route to measurement when evidence is fresh and no regression exists.
{
  const domain = "measure.example";
  const observations = [obs(domain, "overall_score", 78, "2026-07-29T12:00:00Z")];
  const insights = [{ entity_key: domain, status: "accepted", headline: "Test Tuesday", generated_at: "2026-07-29T12:00:00Z" }];
  const portfolio = buildPortfolioTriage({ prospects: [prospect(domain, "Measure Co")], observations, insights, generatedAt });
  assert.equal(portfolio.rows[0].bucket, "measure_recommendation");
  assert.match(portfolio.rows[0].reason, /awaiting measurement/i);
}

// 4) Fresh but sparse businesses route to Build Evidence with a concrete unlock.
{
  const domain = "sparse.example";
  const observations = [obs(domain, "overall_score", 82, "2026-07-29T12:00:00Z")];
  const portfolio = buildPortfolioTriage({ prospects: [prospect(domain, "Sparse Co")], observations, generatedAt });
  assert.equal(portfolio.rows[0].bucket, "build_evidence");
  assert.ok(portfolio.rows[0].next_action.length > 20);
}

// 5) Mature evidence can route a business to Intelligence Ready.
{
  const domain = "ready.example";
  const observations = [
    obs(domain, "overall_score", 78, "2026-07-01T12:00:00Z"),
    obs(domain, "overall_score", 80, "2026-07-15T12:00:00Z"),
    obs(domain, "overall_score", 82, "2026-07-29T12:00:00Z"),
  ];
  for (let i = 0; i < 8; i += 1) {
    observations.push(obs(domain, `check::quality::check-${i}`, 0, "2026-07-01T12:00:00Z"));
    observations.push(obs(domain, `check::quality::check-${i}`, 1, "2026-07-29T12:00:00Z"));
  }

  const events = [];
  for (let i = 1; i <= 12; i += 1) {
    const campaignId = `c-${i}`;
    events.push(event(domain, "campaign_sent", campaignId, `2026-07-${String(i).padStart(2, "0")}T12:00:00Z`, {
      channel: i % 2 ? "sms" : "email",
      offer_id: `offer-${i % 2}`,
      metadata: { comparison_group: `group-${i % 3}` },
    }));
    if (i <= 8) events.push(event(domain, "booking_created", campaignId, `2026-07-${String(i + 1).padStart(2, "0")}T12:00:00Z`));
  }
  for (let i = 1; i <= 10; i += 1) {
    events.push({ entity_key: domain, event_type: "review_received", occurred_at: `2026-07-${String(i).padStart(2, "0")}T15:00:00Z`, metadata: { theme: "friendly staff", sentiment: "positive", rating: 5 } });
  }
  const insights = [
    { entity_key: domain, status: "measured", headline: "A" },
    { entity_key: domain, status: "measured", headline: "B" },
    { entity_key: domain, status: "measured", headline: "C" },
  ];
  const peers = Array.from({ length: 5 }, (_, i) => ({
    name: `Dental Peer ${i + 1}`,
    domain: `dentalpeer${i + 1}.com`,
    peer_quality: { score: 82, confidence: "high", eligible: true, reasons: ["specific category tag"] },
  }));
  const p = prospect(domain, "Ready Co", "2026-07-29T12:00:00Z", { score: 82, competitors: peers });
  const portfolio = buildPortfolioTriage({ prospects: [p], observations, events, insights, generatedAt });
  assert.equal(portfolio.rows[0].readiness_status, "ready");
  assert.equal(portfolio.rows[0].bucket, "intelligence_ready");
}

// 6) Higher urgency sorts first.
{
  const prospects = [prospect("healthy.example", "Healthy", "2026-07-29T12:00:00Z", { score: 95 }), prospect("weak.example", "Weak", "2026-07-29T12:00:00Z", { score: 35 })];
  const portfolio = buildPortfolioTriage({ prospects, generatedAt });
  assert.equal(portfolio.rows[0].domain, "weak.example");
  assert.ok(portfolio.rows[0].urgency > portfolio.rows[1].urgency);
}

console.log("Portfolio triage self-test passed: regression, staleness, measurement, evidence-building, intelligence-ready, and urgency ordering.");
