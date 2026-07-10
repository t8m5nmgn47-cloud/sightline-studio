// Evidence coverage model for Sightline BI. This measures whether enough data
// exists to support each class of advice; it does not score business performance.

const OUTCOMES = new Set(["lead_created", "booking_created", "conversion", "sale_completed"]);
const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const status = (score) => score >= 75 ? "ready" : score >= 50 ? "developing" : "not_ready";
const countScore = (n, developing, ready) => n >= ready ? 100 : n >= developing ? 65 : n > 0 ? 30 : 0;
const distinct = (values) => new Set(values.filter(Boolean)).size;

function dimension(key, label, score, evidence, nextAction) {
  const value = clamp(score);
  return { key, label, score: value, status: status(value), evidence, next_action: nextAction };
}

function changeHistory(observations) {
  const snapshots = observations.filter((o) => o.metric === "overall_score").length;
  const histories = new Map();
  for (const row of observations) {
    if (!String(row.metric || "").startsWith("check::")) continue;
    histories.set(row.metric, (histories.get(row.metric) || 0) + 1);
  }
  const comparable = [...histories.values()].filter((n) => n >= 2).length;
  const score = countScore(snapshots, 2, 3) * 0.55 + countScore(comparable, 3, 8) * 0.45;
  return dimension(
    "change_history", "Change history", score,
    `${snapshots} audit snapshots; ${comparable} checks with repeat measurements`,
    snapshots < 2
      ? "Run a fresh scan after the next meaningful change so Sightline has a before/after comparison."
      : "Keep scans comparable and avoid changing several major things between measurements.",
  );
}

function campaignSample(events) {
  const sends = events.filter((e) => e.event_type === "campaign_sent" && e.campaign_id);
  const campaigns = distinct(sends.map((e) => e.campaign_id));
  const groups = distinct(sends.map((e) => {
    const meta = e.metadata && typeof e.metadata === "object" ? e.metadata : {};
    return meta.comparison_group || `${e.channel || "unknown"}|${e.offer_id || "unspecified"}`;
  }));
  const score = countScore(campaigns, 6, 12) * 0.75 + countScore(groups, 2, 3) * 0.25;
  return dimension(
    "campaign_sample", "Campaign sample", score,
    `${campaigns} campaigns; ${groups} comparison groups`,
    campaigns < 6
      ? "Log the next campaigns with stable campaign IDs, channel, offer, creative, and comparison group."
      : "Keep the next campaigns comparable enough to isolate one variable at a time.",
  );
}

function outcomeLinkage(events) {
  const campaignIds = new Set(events.filter((e) => e.event_type === "campaign_sent" && e.campaign_id).map((e) => e.campaign_id));
  const linked = new Set(events.filter((e) => OUTCOMES.has(e.event_type) && campaignIds.has(e.campaign_id)).map((e) => e.campaign_id));
  const ratio = campaignIds.size ? linked.size / campaignIds.size : 0;
  const ratioScore = ratio >= 0.65 ? 100 : ratio >= 0.4 ? 65 : ratio > 0 ? 30 : 0;
  const score = countScore(linked.size, 3, 8) * 0.65 + ratioScore * 0.35;
  return dimension(
    "outcome_linkage", "Outcome linkage", score,
    `${linked.size} of ${campaignIds.size} recorded campaigns have linked outcomes`,
    linked.size < 3
      ? "Attach bookings, sales, or qualified leads to their campaign IDs. Business outcomes matter more than clicks."
      : "Keep recording outcomes with the original campaign ID and include revenue where it is reliable.",
  );
}

function reviewSignal(events) {
  const reviews = events.filter((e) => e.event_type === "review_received");
  const themed = reviews.filter((e) => e.metadata && typeof e.metadata === "object" && e.metadata.theme);
  const ratio = reviews.length ? themed.length / reviews.length : 0;
  const ratioScore = ratio >= 0.75 ? 100 : ratio >= 0.5 ? 65 : ratio > 0 ? 30 : 0;
  const score = reviews.length ? countScore(themed.length, 5, 10) * 0.8 + ratioScore * 0.2 : 0;
  return dimension(
    "review_signal", "Review signal", score,
    `${reviews.length} review events; ${themed.length} tagged with a theme`,
    themed.length < 5
      ? "Tag the next five reviews with a consistent theme and sentiment so recurring operational patterns can emerge."
      : "Keep theme labels consistent so changes in recurring praise or complaints can be measured.",
  );
}

function peerContext(peerSet, peerObservations) {
  const confidence = peerSet.confidence || "low";
  const historyPeers = distinct(peerObservations.map((o) => o.entity_key));
  let score = confidence === "high" ? 90 : confidence === "medium" ? 65 : 20;
  score += historyPeers >= 3 ? 10 : historyPeers === 0 ? -10 : 0;
  return dimension(
    "peer_context", "Peer context", score,
    `${peerSet.eligible_count || 0} eligible peers; ${historyPeers} with movement history; ${confidence} relevance confidence`,
    confidence === "low"
      ? "Refresh or review the comparison set until at least three credible same-category local peers remain."
      : "Keep the peer set stable long enough to measure movement, then revalidate it when the market changes.",
  );
}

function learningLoop(insights) {
  const accepted = insights.filter((i) => i.status === "accepted").length;
  const measured = insights.filter((i) => i.status === "measured").length;
  const score = measured >= 3 ? 100 : measured >= 1 ? 75 : accepted >= 2 ? 60 : accepted >= 1 ? 45 : insights.length ? 25 : 0;
  return dimension(
    "learning_loop", "Recommendation learning", score,
    `${accepted} accepted recommendations; ${measured} measured results`,
    accepted === 0
      ? "Accept one specific recommendation, define its outcome, and measure it before changing several things at once."
      : measured === 0
        ? "Finish measuring an accepted recommendation so Sightline can learn whether the advice worked."
        : "Keep closing recommendation loops so future advice is grounded in this business's own results.",
  );
}

function readinessCard(next, score, readinessStatus) {
  return {
    type: "test",
    headline: `Next evidence unlock: ${next.label}`,
    body: `Evidence readiness is ${readinessStatus.replace("_", " ")} at ${score}/100. The biggest current gap is ${next.label.toLowerCase()}: ${next.evidence}.`,
    recommendation: next.next_action,
    confidence: "high",
    evidence: {
      sample_size: null,
      period_start: null,
      period_end: null,
      comparison: `${next.label}: ${next.score}/100`,
      absolute_lift: null,
      relative_lift: null,
      source: "evidence_readiness",
      caveat: "Readiness measures evidence coverage, not business performance.",
    },
  };
}

export function buildEvidenceReadiness({ observations = [], events = [], peerSet = {}, peerObservations = [], insights = [] } = {}) {
  const dimensions = [
    changeHistory(observations),
    campaignSample(events),
    outcomeLinkage(events),
    reviewSignal(events),
    peerContext(peerSet, peerObservations),
    learningLoop(insights),
  ];
  const weights = { change_history: 1.1, campaign_sample: 1.2, outcome_linkage: 1.35, review_signal: 0.8, peer_context: 1, learning_loop: 1.15 };
  const totalWeight = dimensions.reduce((sum, d) => sum + weights[d.key], 0);
  const score = clamp(dimensions.reduce((sum, d) => sum + d.score * weights[d.key], 0) / totalWeight);
  const readinessStatus = status(score);
  const next = dimensions.filter((d) => d.score < 75)
    .sort((a, b) => ((100 - b.score) * weights[b.key]) - ((100 - a.score) * weights[a.key]))[0]
    || dimensions.slice().sort((a, b) => a.score - b.score)[0];

  const byKey = new Map(dimensions.map((d) => [d.key, d]));
  const readyFor = {
    exact_change_intelligence: byKey.get("change_history").status === "ready",
    campaign_pattern_intelligence: byKey.get("campaign_sample").status !== "not_ready" && byKey.get("outcome_linkage").status !== "not_ready",
    review_theme_intelligence: byKey.get("review_signal").status !== "not_ready",
    competitor_movement_intelligence: byKey.get("peer_context").status !== "not_ready",
    closed_loop_learning: byKey.get("learning_loop").status === "ready",
  };

  return {
    score,
    status: readinessStatus,
    dimensions,
    next_unlock: next,
    ready_for: readyFor,
    card: score < 80 ? readinessCard(next, score, readinessStatus) : null,
  };
}
