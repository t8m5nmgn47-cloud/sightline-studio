import assert from "node:assert/strict";
import { buildReliableWeeklyBrief, briefCardMaturity } from "../api/_weekly_brief.js";

function card(type, headline, source, sample, confidence = "low", extra = {}) {
  return {
    type,
    headline,
    body: `${headline} body`,
    recommendation: `${headline} action`,
    confidence,
    evidence: {
      sample_size: sample,
      source,
      comparison: extra.comparison || null,
      caveat: extra.caveat || null,
      period_end: extra.period_end || null,
    },
  };
}

// 1) Castle Rock CPA screenshot regression: a single current snapshot plus
// campaign/watch placeholders is a baseline-only brief, not a full story.
{
  const feed = {
    generated_at: "2026-07-10T20:00:00Z",
    entity_key: "castlerockcpa.com",
    summary: {
      evidence_mode: "current_snapshot",
      history_observation_count: 0,
      observation_count: 1,
      event_count: 0,
    },
    cards: [
      card("fix", "Fix the clearest current audit gap first", "prospect_audit_snapshot", 1, "high", {
        comparison: "Current score 23/100 · stored peer average 58/100 · rank 6/6",
        caveat: "This is a current baseline snapshot, not a trend claim.",
      }),
      card("test", "Start the evidence trail with the next promotion", "campaign_events", 0, "low"),
      card("watch", "Keep the next measurement comparable", "prospect_audit_snapshot", 1, "medium"),
    ],
  };

  const brief = buildReliableWeeklyBrief(feed);
  assert.equal(brief.status, "baseline_only");
  assert.equal(brief.section_labels.best_opportunity, "Current audit priority");
  assert.ok(brief.sections.best_opportunity);
  assert.equal(brief.sections.best_opportunity.brief_evidence.key, "baseline");
  assert.equal(brief.sections.next_experiment, null);
  assert.equal(brief.sections.what_to_watch, null);
  assert.equal(brief.suppressed.setup_cards, 2);
  assert.match(brief.headline, /baseline established/i);
}

// 2) A real measured regression outranks a snapshot-only fix, even when the
// snapshot card carries a nominally higher confidence label.
{
  const feed = {
    generated_at: "2026-07-10T20:00:00Z",
    entity_key: "measured.example",
    summary: { observation_count: 12, event_count: 0, history_observation_count: 12 },
    cards: [
      card("fix", "Current snapshot issue", "prospect_audit_snapshot", 1, "high"),
      card("fix", "DMARC regressed in the latest audit", "scheduled_audit_refresh", 3, "medium", {
        comparison: "Pass → Fail",
      }),
    ],
  };
  const brief = buildReliableWeeklyBrief(feed);
  assert.equal(brief.status, "decision_ready");
  assert.equal(brief.sections.best_opportunity.headline, "DMARC regressed in the latest audit");
  assert.equal(brief.section_labels.best_opportunity, "Best opportunity");
}

// 3) Decision-grade repeat and experiment cards are preserved.
{
  const feed = {
    generated_at: "2026-07-10T20:00:00Z",
    entity_key: "campaign.example",
    summary: { observation_count: 8, event_count: 30, history_observation_count: 8 },
    cards: [
      card("repeat", "SMS is outperforming EMAIL", "campaign_economics", 10, "medium", { comparison: "$900 vs $520 revenue/campaign" }),
      card("test", "Tuesday campaigns are outperforming Wednesday", "campaign_events", 8, "low", { comparison: "75% vs 25%" }),
    ],
  };
  const brief = buildReliableWeeklyBrief(feed);
  assert.equal(brief.status, "decision_ready");
  assert.equal(brief.sections.what_is_working.headline, "SMS is outperforming EMAIL");
  assert.equal(brief.sections.next_experiment.headline, "Tuesday campaigns are outperforming Wednesday");
}

// 4) Readiness/setup cards never become owner-facing experiments.
{
  const setup = card("test", "Next evidence unlock: Outcome linkage", "evidence_readiness", 0, "high");
  assert.equal(briefCardMaturity(setup), "setup");
  const brief = buildReliableWeeklyBrief({
    entity_key: "setup.example",
    summary: { observation_count: 4, event_count: 2 },
    cards: [setup],
  });
  assert.equal(brief.status, "building_evidence");
  assert.equal(brief.sections.next_experiment, null);
  assert.match(brief.status_message, /will not fill a weekly brief with placeholders/i);
}

// 5) Empty evidence stays empty and honest.
{
  const brief = buildReliableWeeklyBrief({ entity_key: "empty.example", summary: {}, cards: [] });
  assert.equal(brief.status, "empty");
  assert.equal(Object.values(brief.sections).filter(Boolean).length, 0);
  assert.match(brief.status_message, /will not invent recommendations/i);
}

console.log("Weekly Brief reliability self-test passed: baseline-only suppression, evidence ranking, real patterns, setup suppression, and empty-state honesty.");
