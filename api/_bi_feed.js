// Shared server-side loader for Opportunity Feed and Weekly Brief endpoints.

import { sbSelect } from "./_lib.js";
import { buildOpportunityFeed } from "./_intelligence.js";
import { enrichOpportunityFeed } from "./_bi_patterns.js";
import { buildCheckChangeCards, countCheckChanges } from "./_change_intelligence.js";
import { buildEvidenceReadiness } from "./_readiness_intelligence.js";
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
    sbSelect(
      "bi_observations",
      `select=metric,value_numeric,value_text,observed_at,source,dimensions&entity_key=eq.${entity}&order=observed_at.asc&limit=4000`,
    ),
    sbSelect(
      "bi_events",
      `select=event_type,occurred_at,channel,campaign_id,offer_id,creative_id,local_weekday,local_hour,value_numeric,metadata&entity_key=eq.${entity}&order=occurred_at.asc&limit=5000`,
    ),
  ]);

  let peerObservations = [];
  let peerSet = {
    confidence: "low",
    average_score: 0,
    eligible_count: 0,
    suppressed_count: 0,
    eligible: [],
  };
  try {
    const prospectRows = await sbSelect("prospect_audits", `select=vertical,competitors&domain=eq.${entity}&limit=1`);
    const prospect = prospectRows?.[0] || null;
    peerSet = assessPeerSet(prospect?.vertical || "", prospect?.competitors || []);
    const peers = peerSet.eligible
      .map((p) => normDomain(p?.domain || ""))
      .filter(Boolean)
      .slice(0, 8);

    // A low-confidence peer set is not allowed to create movement claims.
    if (peerSet.confidence !== "low" && peers.length) {
      const parts = await Promise.all(peers.map(async (peer) => {
        try {
          return await sbSelect(
            "bi_observations",
            `select=entity_key,metric,value_numeric,observed_at,source&entity_key=eq.${encodeURIComponent(peer)}&metric=eq.overall_score&order=observed_at.asc&limit=500`,
          );
        } catch {
          return [];
        }
      }));
      peerObservations = parts.flat();
    }
  } catch (e) {
    console.error("BI peer context unavailable:", e?.message || e);
  }

  let tracked = [];
  try {
    tracked = await sbSelect(
      "bi_insights",
      `select=id,headline,status,generated_at,review_after&entity_key=eq.${entity}&order=generated_at.desc&limit=100`,
    );
  } catch (e) {
    console.error("BI recommendation tracking unavailable:", e?.message || e);
  }

  const generatedAt = new Date().toISOString();
  const base = buildOpportunityFeed({ entityKey: domain, observations, events, generatedAt });
  let feed = enrichOpportunityFeed(base, { observations, events, peerObservations, generatedAt });
  const checkChangeCards = buildCheckChangeCards(observations);
  const readiness = buildEvidenceReadiness({ observations, events, peerSet, peerObservations, insights: tracked });
  feed = {
    ...feed,
    cards: mergeDecisionCards(checkChangeCards, [...feed.cards, readiness.card]),
    summary: {
      ...feed.summary,
      check_changes: countCheckChanges(observations),
      readiness: {
        score: readiness.score,
        status: readiness.status,
        next_unlock: readiness.next_unlock,
        ready_for: readiness.ready_for,
      },
      peer_set: {
        confidence: peerSet.confidence,
        average_relevance_score: peerSet.average_score,
        eligible_peers: peerSet.eligible_count,
        suppressed_peers: peerSet.suppressed_count,
      },
    },
    readiness,
  };

  // Attach the latest tracked recommendation state to cards by exact headline.
  const latestByHeadline = new Map();
  for (const item of tracked) if (!latestByHeadline.has(item.headline)) latestByHeadline.set(item.headline, item);
  feed = {
    ...feed,
    cards: feed.cards.map((c) => ({ ...c, tracking: latestByHeadline.get(c.headline) || null })),
  };

  return feed;
}
