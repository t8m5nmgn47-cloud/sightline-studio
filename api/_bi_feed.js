// Shared server-side loader for Opportunity Feed and Weekly Brief endpoints.

import { sbSelect } from "./_lib.js";
import { buildOpportunityFeed } from "./_intelligence.js";
import { enrichOpportunityFeed } from "./_bi_patterns.js";
import { buildCheckChangeCards, countCheckChanges } from "./_change_intelligence.js";
import { buildEvidenceReadiness } from "./_readiness_intelligence.js";
import { buildLearningMemory } from "./_learning_memory.js";
import { buildCampaignEconomics } from "./_campaign_economics.js";
import { snapshotObservationRows, buildProspectSnapshotCard } from "./_prospect_snapshot.js";
import { normDomain } from "./_audit.js";
import { assessPeerSet } from "./_peer_quality.js";

function mergeDecisionCards(primary = [], secondary = [], limit = 10) {
  const seen = new Set();
  const cards = [...primary, ...secondary].filter((card) => {
    if (!card) return false;
    const key = `${card.type}|${card.headline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const priority = { fix: 1, repeat: 2, test: 3, watch: 4 };
  cards.sort((a, b) => (priority[a.type] || 9) - (priority[b.type] || 9));
  return cards.slice(0, limit);
}

export async function loadIntelligenceFeed(domain) {
  const entity = encodeURIComponent(domain);
  const [observations, events] = await Promise.all([
    sbSelect("bi_observations", `select=metric,value_numeric,value_text,observed_at,source,dimensions&entity_key=eq.${entity}&order=observed_at.asc&limit=4000`),
    sbSelect("bi_events", `select=event_type,occurred_at,channel,campaign_id,offer_id,creative_id,local_weekday,local_hour,value_numeric,metadata&entity_key=eq.${entity}&order=occurred_at.asc&limit=5000`),
  ]);

  let prospect = null;
  let peerObservations = [];
  let peerSet = { confidence: "low", average_score: 0, eligible_count: 0, suppressed_count: 0, eligible: [] };
  try {
    const prospectRows = await sbSelect(
      "prospect_audits",
      `select=score,field_avg,rank,count,top_gap,updated_at,vertical,competitors&domain=eq.${entity}&limit=1`,
    );
    prospect = prospectRows?.[0] || null;
    peerSet = assessPeerSet(prospect?.vertical || "", prospect?.competitors || []);
    const peers = peerSet.eligible.map((p) => normDomain(p?.domain || "")).filter(Boolean).slice(0, 8);
    if (peerSet.confidence !== "low" && peers.length) {
      const parts = await Promise.all(peers.map(async (peer) => {
        try {
          return await sbSelect("bi_observations", `select=entity_key,metric,value_numeric,observed_at,source&entity_key=eq.${encodeURIComponent(peer)}&metric=eq.overall_score&order=observed_at.asc&limit=500`);
        } catch { return []; }
      }));
      peerObservations = parts.flat();
    }
  } catch (e) { console.error("BI peer context unavailable:", e?.message || e); }

  // A tracked audit snapshot is valid point-in-time evidence. When immutable BI
  // history is still empty, use it as a one-observation baseline without making
  // any trend claim. Repeat measurements still come only from BI history.
  const snapshotRows = observations.length ? [] : snapshotObservationRows(prospect);
  const snapshotCard = snapshotRows.length ? buildProspectSnapshotCard(prospect) : null;
  const effectiveObservations = observations.length ? observations : snapshotRows;

  let tracked = [];
  let outcomes = [];
  try {
    tracked = await sbSelect("bi_insights", `select=id,entity_key,insight_type,headline,confidence,evidence,status,generated_at,review_after&entity_key=eq.${entity}&order=generated_at.desc&limit=100`);
    const ids = tracked.map((item) => item.id).filter(Boolean);
    if (ids.length) outcomes = await sbSelect("bi_recommendation_outcomes", `select=insight_id,accepted_at,implemented_at,measurement_start,measurement_end,result,measured_lift,notes&insight_id=in.(${ids.join(",")})&order=measurement_end.desc&limit=200`);
  } catch (e) { console.error("BI recommendation tracking unavailable:", e?.message || e); }

  const generatedAt = new Date().toISOString();
  const base = buildOpportunityFeed({ entityKey: domain, observations: effectiveObservations, events, generatedAt });
  let feed = enrichOpportunityFeed(base, { observations: effectiveObservations, events, peerObservations, generatedAt });
  const checkChangeCards = buildCheckChangeCards(effectiveObservations);
  const readiness = buildEvidenceReadiness({ observations: effectiveObservations, events, peerSet, peerObservations, insights: tracked });
  const learningMemory = buildLearningMemory({ insights: tracked, outcomes });
  const campaignEconomics = buildCampaignEconomics(events);
  feed = {
    ...feed,
    cards: mergeDecisionCards(
      [...checkChangeCards, snapshotCard].filter(Boolean),
      [...feed.cards, ...campaignEconomics.cards, readiness.card, learningMemory.card],
    ),
    summary: {
      ...feed.summary,
      evidence_mode: observations.length ? "history" : snapshotCard ? "current_snapshot" : "empty",
      history_observation_count: observations.length,
      snapshot_baseline: !!snapshotCard,
      check_changes: countCheckChanges(effectiveObservations),
      readiness: { score: readiness.score, status: readiness.status, next_unlock: readiness.next_unlock, ready_for: readiness.ready_for },
      learning_memory: {
        measured: learningMemory.summary.measured, decisive: learningMemory.summary.decisive,
        successful: learningMemory.summary.successful, inconclusive: learningMemory.summary.inconclusive,
        success_rate: learningMemory.summary.success_rate,
      },
      campaign_economics: campaignEconomics.summary,
      peer_set: {
        confidence: peerSet.confidence, average_relevance_score: peerSet.average_score,
        eligible_peers: peerSet.eligible_count, suppressed_peers: peerSet.suppressed_count,
      },
    },
    readiness,
    learning_memory: learningMemory,
    campaign_economics: campaignEconomics,
  };

  const latestByHeadline = new Map();
  for (const item of tracked) if (!latestByHeadline.has(item.headline)) latestByHeadline.set(item.headline, item);
  feed = { ...feed, cards: feed.cards.map((c) => ({ ...c, tracking: latestByHeadline.get(c.headline) || null })) };
  return feed;
}
