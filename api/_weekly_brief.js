// Evidence-aware Weekly Intelligence Brief assembly.
//
// The Opportunity Feed contains both business decisions and evidence-building
// prompts. The owner-facing brief must not pretend those are the same thing.
// This module classifies card maturity, ranks evidence, and suppresses setup
// placeholders until they become decision-grade signals.

const CONFIDENCE_SCORE = { high: 30, medium: 20, low: 10 };
const SOURCE_SCORE = {
  audit_check_change: 95,
  scheduled_audit_refresh: 90,
  campaign_economics: 90,
  recommendation_outcomes: 88,
  review_events: 85,
  signal_local_change: 83,
  campaign_events: 82,
  peer_movement: 80,
  exposure_audit: 72,
  instant_scan: 70,
  signal_social_identity: 68,
  signal_local_identity: 65,
  signal_access_state: 60,
  prospect_audit_snapshot: 45,
  evidence_readiness: 10,
};
const BASELINE_CAVEAT = "This is a current baseline observation, not a trend or peer-performance claim.";

function source(card) {
  return String(card?.evidence?.source || "").toLowerCase();
}

function sample(card) {
  const value = Number(card?.evidence?.sample_size);
  return Number.isFinite(value) ? value : 0;
}

function isAuditSource(value) {
  return /audit|scan|exposure/.test(value);
}

function isCampaignSetup(card) {
  if (source(card) !== "campaign_events") return false;
  if (sample(card) >= 6) return false;
  return card?.type === "test" || /evidence trail|comparable promotion sample/i.test(String(card?.headline || ""));
}

function isGenericMeasurementWatch(card) {
  const headline = String(card?.headline || "");
  return /keep the next measurement comparable|no intelligence history yet/i.test(headline);
}

export function briefCardMaturity(card) {
  if (!card) return "setup";
  const src = source(card);
  const n = sample(card);

  if (src === "evidence_readiness" || isCampaignSetup(card) || isGenericMeasurementWatch(card)) return "setup";
  if (["signal_access_state", "signal_local_identity", "signal_social_identity"].includes(src)) return "baseline";
  if (src === "signal_local_change") return n >= 2 ? "measured" : "baseline";
  if (src === "prospect_audit_snapshot") return "baseline";
  if (isAuditSource(src) && n < 2) return "baseline";
  if (src === "campaign_events" && n < 6) return "limited";
  if (src === "review_events" && n < 3) return "limited";
  if (src === "campaign_economics" && n < 6) return "limited";
  if (src === "recommendation_outcomes" && n < 2) return "limited";
  if (src === "peer_movement" && n < 3) return "limited";
  return "measured";
}

function evidenceStrength(card) {
  const maturity = briefCardMaturity(card);
  if (maturity === "baseline") return { key: "baseline", label: "current baseline only" };
  if (maturity === "setup") return { key: "setup", label: "evidence setup" };
  if (maturity === "limited") return { key: "limited", label: "limited evidence" };
  const confidence = String(card?.confidence || "low").toLowerCase();
  if (confidence === "high") return { key: "strong", label: "strong evidence" };
  if (confidence === "medium") return { key: "supported", label: "supported evidence" };
  return { key: "emerging", label: "emerging evidence" };
}

function scoreCard(card) {
  if (!card) return -Infinity;
  const src = source(card);
  const maturity = briefCardMaturity(card);
  const maturityScore = { measured: 100, limited: 45, baseline: 25, setup: 0 }[maturity] || 0;
  const sourceScore = SOURCE_SCORE[src] ?? (isAuditSource(src) ? 70 : 55);
  const confidenceScore = CONFIDENCE_SCORE[String(card?.confidence || "low").toLowerCase()] || 0;
  const sampleScore = Math.min(24, Math.log2(sample(card) + 1) * 6);
  const comparisonScore = card?.evidence?.comparison ? 8 : 0;
  const caveatPenalty = /baseline snapshot|not a trend claim|one-day identity baseline|access finding only|not verified ownership/i.test(String(card?.evidence?.caveat || "")) ? 8 : 0;
  return maturityScore + sourceScore + confidenceScore + sampleScore + comparisonScore - caveatPenalty;
}

function decorate(card) {
  if (!card) return null;
  const maturity = briefCardMaturity(card);
  const evidence = { ...(card.evidence || {}) };
  if (maturity === "baseline" && !evidence.caveat) evidence.caveat = BASELINE_CAVEAT;
  return {
    ...card,
    evidence,
    brief_evidence: evidenceStrength(card),
  };
}

function choose(cards, predicate, allowedMaturity = new Set(["measured"])) {
  return cards
    .filter((card) => predicate(card) && allowedMaturity.has(briefCardMaturity(card)))
    .sort((a, b) => scoreCard(b) - scoreCard(a))[0] || null;
}

function baselinePriority(cards) {
  return cards
    .filter((card) => briefCardMaturity(card) === "baseline")
    .sort((a, b) => {
      const typeScore = { fix: 3, watch: 2, repeat: 1 };
      return (typeScore[b.type] || 0) - (typeScore[a.type] || 0) || scoreCard(b) - scoreCard(a);
    })[0] || null;
}

function statusFor({ measuredPriority, repeat, experiment, watch, baseline, summary }) {
  if (measuredPriority || repeat || experiment || watch) return "decision_ready";
  if (baseline) return "baseline_only";
  if ((summary?.history_observation_count || summary?.observation_count || 0) > 0 || (summary?.event_count || 0) > 0) return "building_evidence";
  return "empty";
}

function statusCopy(status) {
  if (status === "baseline_only") {
    return {
      headline: "Current baseline established. Measure the next change before drawing a trend.",
      message: "Sightline has a current point-in-time audit or public-signal baseline, but not enough repeated history to claim what is improving, what is declining, or which campaign pattern is winning. The brief shows the current evidence priority and suppresses unsupported sections.",
    };
  }
  if (status === "building_evidence") {
    return {
      headline: "Evidence is collecting, but no decision-grade pattern is ready yet.",
      message: "Sightline will not fill a weekly brief with placeholders. Keep measurements comparable and connect outcomes until a repeated pattern is strong enough to support a decision.",
    };
  }
  if (status === "empty") {
    return {
      headline: "No evidence has been collected for this business yet.",
      message: "Run the first comparable audit or record business outcome events before expecting an intelligence brief. Sightline will not invent recommendations from an empty evidence base.",
    };
  }
  return null;
}

export function buildReliableWeeklyBrief(feed = {}) {
  const cards = Array.isArray(feed.cards) ? feed.cards.filter(Boolean) : [];
  const measuredPriority = choose(cards, (card) => card.type === "fix");
  const repeat = choose(cards, (card) => card.type === "repeat");
  const experiment = choose(cards, (card) => card.type === "test");
  const watch = choose(cards, (card) => card.type === "watch");
  const baseline = baselinePriority(cards);
  const bestOpportunity = measuredPriority || baseline;
  const status = statusFor({ measuredPriority, repeat, experiment, watch, baseline, summary: feed.summary || {} });
  const copy = statusCopy(status);

  const leading = measuredPriority || repeat || experiment || watch;
  const headline = leading?.headline || copy?.headline || "Keep measuring the same business outcomes";

  return {
    generated_at: feed.generated_at || new Date().toISOString(),
    entity_key: feed.entity_key || feed.summary?.resolved_entity_key || null,
    status,
    headline,
    status_message: copy?.message || null,
    section_labels: {
      best_opportunity: baseline && bestOpportunity === baseline ? "Current evidence priority" : "Best opportunity",
      what_is_working: "What is working",
      next_experiment: "Next experiment",
      what_to_watch: "What to watch",
    },
    sections: {
      best_opportunity: decorate(bestOpportunity),
      what_is_working: decorate(repeat),
      next_experiment: decorate(experiment),
      what_to_watch: decorate(watch),
    },
    suppressed: {
      setup_cards: cards.filter((card) => briefCardMaturity(card) === "setup").length,
      limited_cards: cards.filter((card) => briefCardMaturity(card) === "limited").length,
    },
    evidence_summary: feed.summary || {},
  };
}
