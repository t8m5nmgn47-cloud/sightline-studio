// Portfolio triage for tracked primary businesses. This ranks operator attention
// without confusing evidence readiness with business performance.

import { buildCheckChangeCards } from "./_change_intelligence.js";
import { buildEvidenceReadiness } from "./_readiness_intelligence.js";
import { assessPeerSet } from "./_peer_quality.js";

const DAY_MS = 86_400_000;

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function groupBy(rows, key = "entity_key") {
  const map = new Map();
  for (const row of rows || []) {
    const value = String(row?.[key] || "").toLowerCase();
    if (!value) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
}

function latestOverall(observations, fallbackScore = 0) {
  const rows = observations
    .filter((o) => o.metric === "overall_score" && Number.isFinite(Number(o.value_numeric)))
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  if (!rows.length) return { score: num(fallbackScore), at: null };
  const latest = rows[rows.length - 1];
  return { score: num(latest.value_numeric), at: latest.observed_at };
}

function ageDays(at, generatedAt) {
  if (!at) return null;
  const age = Date.parse(generatedAt) - Date.parse(at);
  return Number.isFinite(age) ? Math.max(0, Math.floor(age / DAY_MS)) : null;
}

function urgencyScore({ score, staleDays, regression, acceptedCount }) {
  let urgency = 0;
  if (score < 50) urgency += 35;
  else if (score < 70) urgency += 20;
  else if (score < 85) urgency += 8;

  if (regression) urgency += 25;
  if (staleDays == null) urgency += 15;
  else if (staleDays > 30) urgency += 20;
  else if (staleDays > 14) urgency += 10;

  if (acceptedCount > 0) urgency += Math.min(15, 5 + acceptedCount * 3);
  return Math.min(100, urgency);
}

function triage({ regression, staleDays, readiness, acceptedCount, score }) {
  if (regression) return {
    bucket: "attention",
    next_action: regression.recommendation,
    reason: regression.headline,
  };
  if (staleDays == null || staleDays > 30) return {
    bucket: "refresh_evidence",
    next_action: "Run a fresh audit before making a material recommendation.",
    reason: staleDays == null ? "No measured audit history yet" : `Latest audit evidence is ${staleDays} days old`,
  };
  if (acceptedCount > 0) return {
    bucket: "measure_recommendation",
    next_action: "Close the measurement loop on the accepted recommendation before adding several new changes.",
    reason: `${acceptedCount} accepted recommendation${acceptedCount === 1 ? "" : "s"} awaiting measurement`,
  };
  if (readiness.score < 50) return {
    bucket: "build_evidence",
    next_action: readiness.next_unlock.next_action,
    reason: `${readiness.next_unlock.label} is the biggest evidence gap`,
  };
  if (readiness.score >= 75) return {
    bucket: "intelligence_ready",
    next_action: "Review the Opportunity Feed and Weekly Brief for the highest-confidence next move.",
    reason: `Evidence readiness is ${readiness.score}/100`,
  };
  return {
    bucket: "monitor",
    next_action: readiness.next_unlock.next_action,
    reason: `Evidence readiness is developing at ${readiness.score}/100`,
  };
}

export function buildPortfolioTriage({ prospects = [], observations = [], events = [], insights = [], generatedAt = new Date().toISOString() } = {}) {
  const observationsByEntity = groupBy(observations);
  const eventsByEntity = groupBy(events);
  const insightsByEntity = groupBy(insights);

  const rows = (prospects || []).map((prospect) => {
    const domain = String(prospect.domain || "").toLowerCase();
    const entityObservations = observationsByEntity.get(domain) || [];
    const entityEvents = eventsByEntity.get(domain) || [];
    const entityInsights = insightsByEntity.get(domain) || [];
    const peerSet = assessPeerSet(prospect.vertical || "", prospect.competitors || []);
    const readiness = buildEvidenceReadiness({
      observations: entityObservations,
      events: entityEvents,
      peerSet,
      peerObservations: [],
      insights: entityInsights,
    });
    const changes = buildCheckChangeCards(entityObservations);
    const regression = changes.find((card) => card.type === "fix") || null;
    const latest = latestOverall(entityObservations, prospect.score);
    const latestAt = latest.at || prospect.updated_at || null;
    const staleDays = ageDays(latestAt, generatedAt);
    const acceptedCount = entityInsights.filter((i) => i.status === "accepted").length;
    const measuredCount = entityInsights.filter((i) => i.status === "measured").length;
    const urgency = urgencyScore({ score: latest.score, staleDays, regression, acceptedCount });
    const decision = triage({ regression, staleDays, readiness, acceptedCount, score: latest.score });

    return {
      slug: prospect.slug || null,
      name: prospect.name || domain,
      domain,
      vertical: prospect.vertical || null,
      current_score: latest.score,
      latest_evidence_at: latestAt,
      stale_days: staleDays,
      urgency,
      bucket: decision.bucket,
      reason: decision.reason,
      next_action: decision.next_action,
      readiness_score: readiness.score,
      readiness_status: readiness.status,
      next_evidence_unlock: readiness.next_unlock,
      peer_confidence: peerSet.confidence,
      eligible_peers: peerSet.eligible_count,
      accepted_recommendations: acceptedCount,
      measured_recommendations: measuredCount,
      regression: regression ? {
        headline: regression.headline,
        confidence: regression.confidence,
        evidence: regression.evidence,
      } : null,
    };
  });

  rows.sort((a, b) => b.urgency - a.urgency || b.readiness_score - a.readiness_score || a.name.localeCompare(b.name));

  const bucketCounts = {};
  for (const row of rows) bucketCounts[row.bucket] = (bucketCounts[row.bucket] || 0) + 1;

  return {
    generated_at: generatedAt,
    summary: {
      tracked_businesses: rows.length,
      attention: bucketCounts.attention || 0,
      refresh_evidence: bucketCounts.refresh_evidence || 0,
      measure_recommendation: bucketCounts.measure_recommendation || 0,
      build_evidence: bucketCounts.build_evidence || 0,
      intelligence_ready: bucketCounts.intelligence_ready || 0,
      monitor: bucketCounts.monitor || 0,
    },
    rows,
  };
}
