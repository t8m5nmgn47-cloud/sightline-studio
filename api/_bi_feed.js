// Shared server-side loader for Opportunity Feed and Weekly Brief endpoints.

import { sbSelect } from "./_lib.js";
import { buildOpportunityFeed } from "./_intelligence.js";
import { enrichOpportunityFeed } from "./_bi_patterns.js";
import { buildCheckChangeCards, countCheckChanges } from "./_change_intelligence.js";
import { buildEvidenceReadiness } from "./_readiness_intelligence.js";
import { buildLearningMemory } from "./_learning_memory.js";
import { buildCampaignEconomics } from "./_campaign_economics.js";
import { snapshotObservationRows, buildProspectSnapshotCard } from "./_prospect_snapshot.js";
import { canonicalDomainIdentity, domainAliases, resolveDomainRecord } from "./_domain_identity.js";
import { normDomain } from "./_audit.js";
import { assessPeerSet } from "./_peer_quality.js";
import { readSignalLedger } from "./_signal_store.js";
import { buildSignalInterpretation } from "./_signal_interpretation.js";

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

function sortByDate(rows, field, direction = "asc") {
  return rows.slice().sort((a, b) => {
    const delta = Date.parse(a?.[field] || 0) - Date.parse(b?.[field] || 0);
    return direction === "desc" ? -delta : delta;
  });
}

async function selectEntityAliases(table, select, aliases, orderField, limit) {
  const parts = await Promise.all(aliases.map((alias) => sbSelect(
    table,
    `select=${select}&entity_key=ilike.${encodeURIComponent(alias)}&order=${orderField}.asc&limit=${limit}`,
  )));
  return sortByDate(parts.flat(), orderField, "asc");
}

async function resolveProspectAudit(domain) {
  const select = "domain,score,field_avg,rank,count,top_gap,updated_at,vertical,competitors";
  const aliases = domainAliases(domain);

  const directParts = await Promise.all(aliases.map((alias) => sbSelect(
    "prospect_audits",
    `select=${select}&domain=ilike.${encodeURIComponent(alias)}&order=updated_at.desc&limit=1`,
  )));
  let prospect = resolveDomainRecord(directParts.flat(), domain);
  if (prospect) return prospect;

  // Defensive fallback for legacy rows that stored a full URL, trailing slash, or
  // another non-canonical spelling in the domain column.
  const candidates = await sbSelect(
    "prospect_audits",
    `select=${select}&order=updated_at.desc&limit=1000`,
  );
  prospect = resolveDomainRecord(candidates, domain);
  return prospect;
}

export async function loadIntelligenceFeed(domain) {
  let prospect = null;
  let peerObservations = [];
  let peerSet = { confidence: "low", average_score: 0, eligible_count: 0, suppressed_count: 0, eligible: [] };

  try {
    prospect = await resolveProspectAudit(domain);
    peerSet = assessPeerSet(prospect?.vertical || "", prospect?.competitors || []);
    const peers = peerSet.eligible.map((p) => normDomain(p?.domain || "")).filter(Boolean).slice(0, 8);
    if (peerSet.confidence !== "low" && peers.length) {
      const parts = await Promise.all(peers.map(async (peer) => {
        try {
          return await sbSelect("bi_observations", `select=entity_key,metric,value_numeric,observed_at,source&entity_key=ilike.${encodeURIComponent(peer)}&metric=eq.overall_score&order=observed_at.asc&limit=500`);
        } catch { return []; }
      }));
      peerObservations = parts.flat();
    }
  } catch (e) { console.error("BI peer context unavailable:", e?.message || e); }

  const aliases = domainAliases(domain, prospect?.domain);
  const entityKey = canonicalDomainIdentity(prospect?.domain || domain) || normDomain(domain);
  const [observations, events] = await Promise.all([
    selectEntityAliases("bi_observations", "metric,value_numeric,value_text,observed_at,source,dimensions", aliases, "observed_at", 4000),
    selectEntityAliases("bi_events", "event_type,occurred_at,channel,campaign_id,offer_id,creative_id,local_weekday,local_hour,value_numeric,metadata", aliases, "occurred_at", 5000),
  ]);

  // A tracked audit snapshot is valid point-in-time evidence. When immutable BI
  // history is still empty, use it as a one-observation baseline without making
  // any trend claim. Repeat measurements still come only from BI history.
  const snapshotRows = observations.length ? [] : snapshotObservationRows(prospect);
  const snapshotCard = snapshotRows.length ? buildProspectSnapshotCard(prospect) : null;
  const effectiveObservations = observations.length ? observations : snapshotRows;

  let tracked = [];
  let outcomes = [];
  try {
    const trackedParts = await Promise.all(aliases.map((alias) => sbSelect(
      "bi_insights",
      `select=id,entity_key,insight_type,headline,confidence,evidence,status,generated_at,review_after&entity_key=ilike.${encodeURIComponent(alias)}&order=generated_at.desc&limit=100`,
    )));
    tracked = sortByDate(trackedParts.flat(), "generated_at", "desc");
    const ids = tracked.map((item) => item.id).filter(Boolean);
    if (ids.length) outcomes = await sbSelect("bi_recommendation_outcomes", `select=insight_id,accepted_at,implemented_at,measurement_start,measurement_end,result,measured_lift,notes&insight_id=in.(${ids.join(",")})&order=measurement_end.desc&limit=200`);
  } catch (e) { console.error("BI recommendation tracking unavailable:", e?.message || e); }

  const generatedAt = new Date().toISOString();
  let signalLedger = null;
  let signalSetupRequired = false;
  try {
    const signalResult = await readSignalLedger(entityKey);
    signalLedger = signalResult?.ledger || null;
    signalSetupRequired = signalResult?.setup_required === true;
  } catch (e) {
    // Signal evidence is additive. A temporary Signal read failure must not take
    // down the established BI feed.
    console.error("Signal interpretation unavailable:", e?.message || e);
  }
  const signalInterpretation = buildSignalInterpretation(signalLedger || {}, { generatedAt });

  const base = buildOpportunityFeed({ entityKey, observations: effectiveObservations, events, generatedAt });
  let feed = enrichOpportunityFeed(base, { observations: effectiveObservations, events, peerObservations, generatedAt });
  const checkChangeCards = buildCheckChangeCards(effectiveObservations);
  const readiness = buildEvidenceReadiness({ observations: effectiveObservations, events, peerSet, peerObservations, insights: tracked });
  const learningMemory = buildLearningMemory({ insights: tracked, outcomes });
  const campaignEconomics = buildCampaignEconomics(events);
  feed = {
    ...feed,
    cards: mergeDecisionCards(
      [...checkChangeCards, ...signalInterpretation.cards, snapshotCard].filter(Boolean),
      [...feed.cards, ...campaignEconomics.cards, readiness.card, learningMemory.card],
    ),
    summary: {
      ...feed.summary,
      resolved_entity_key: entityKey,
      evidence_mode: observations.length ? "history" : snapshotCard ? "current_snapshot" : "empty",
      history_observation_count: observations.length,
      snapshot_baseline: !!snapshotCard,
      check_changes: countCheckChanges(effectiveObservations),
      signal_interpretation: {
        ...signalInterpretation.summary,
        state: signalInterpretation.state,
        setup_required: signalSetupRequired,
        card_count: signalInterpretation.cards.length,
      },
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
    signal_interpretation: signalInterpretation,
  };

  const latestByHeadline = new Map();
  for (const item of tracked) if (!latestByHeadline.has(item.headline)) latestByHeadline.set(item.headline, item);
  feed = { ...feed, cards: feed.cards.map((c) => ({ ...c, tracking: latestByHeadline.get(c.headline) || null })) };
  return feed;
}
