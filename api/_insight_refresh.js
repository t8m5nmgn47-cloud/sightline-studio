// Pure helpers for scheduled BI insight persistence.
// Live feed context stays live; only actionable Fix / Repeat / Test cards are
// eligible to become stored recommendations.

const ACTIONABLE = new Set(["fix", "repeat", "test"]);
const DAY_MS = 86_400_000;

function futureIso(from, days) {
  return new Date(Date.parse(from) + days * DAY_MS).toISOString();
}

function generatedMs(row) {
  const ms = Date.parse(row?.generated_at || "");
  return Number.isFinite(ms) ? ms : 0;
}

export function actionableCards(feed = {}, limit = 4) {
  const seen = new Set();
  return (feed.cards || [])
    .filter((card) => ACTIONABLE.has(card?.type))
    .filter((card) => card?.evidence?.source !== "evidence_readiness")
    .filter((card) => {
      const headline = String(card?.headline || "").trim();
      if (!headline || seen.has(headline)) return false;
      seen.add(headline);
      return true;
    })
    .slice(0, limit);
}

export function insightRow(entityKey, card, generatedAt = new Date().toISOString()) {
  return {
    entity_key: entityKey,
    insight_type: card.type,
    headline: String(card.headline || "").slice(0, 500),
    body: String(card.body || "").slice(0, 5000),
    recommendation: String(card.recommendation || "").slice(0, 5000),
    confidence: ["low", "medium", "high"].includes(card.confidence) ? card.confidence : "low",
    evidence: card.evidence && typeof card.evidence === "object" ? card.evidence : {},
    generated_at: generatedAt,
    review_after: futureIso(generatedAt, 14),
    status: "active",
  };
}

export function planInsightRefresh({ entityKey, feed = {}, existing = [], generatedAt = new Date().toISOString(), expireAfterDays = 21 } = {}) {
  const cards = actionableCards(feed);
  const currentHeadlines = new Set(cards.map((card) => card.headline));
  const active = (existing || []).filter((row) => row.status === "active");
  const activeHeadlines = new Set(active.map((row) => row.headline));
  const cutoff = Date.parse(generatedAt) - expireAfterDays * DAY_MS;

  const create = cards
    .filter((card) => !activeHeadlines.has(card.headline))
    .map((card) => insightRow(entityKey, card, generatedAt));

  const expire = active
    .filter((row) => !currentHeadlines.has(row.headline))
    .filter((row) => generatedMs(row) > 0 && generatedMs(row) < cutoff)
    .map((row) => row.id)
    .filter(Boolean);

  return {
    actionable_count: cards.length,
    create,
    expire,
    unchanged: cards.filter((card) => activeHeadlines.has(card.headline)).map((card) => card.headline),
  };
}
