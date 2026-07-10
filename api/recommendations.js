// GET /api/recommendations?domain=example.com
// POST /api/recommendations
// Admin-only recommendation lifecycle: accept -> implement -> measure.

import { clean, readBody, sbInsertReturning, sbSelect, sbUpdate } from "./_lib.js";
import { normDomain } from "./_audit.js";

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["repeat", "fix", "test", "watch"]);
const RESULTS = new Set(["successful", "inconclusive", "unsuccessful", "reversed"]);

async function outcomeFor(insightId) {
  const rows = await sbSelect("bi_recommendation_outcomes", `select=*&insight_id=eq.${encodeURIComponent(insightId)}&limit=1`);
  return rows[0] || null;
}

async function ensureOutcome(insightId, row) {
  const existing = await outcomeFor(insightId);
  if (existing) {
    await sbUpdate("bi_recommendation_outcomes", `insight_id=eq.${encodeURIComponent(insightId)}`, row);
    return { ...existing, ...row };
  }
  const created = await sbInsertReturning("bi_recommendation_outcomes", { insight_id: insightId, ...row });
  return created[0] || null;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const domain = normDomain(req.query?.domain || "");
    if (!domain || !DOMAIN_RE.test(domain)) return res.status(400).json({ ok: false, error: "Enter a valid domain." });
    try {
      const insights = await sbSelect(
        "bi_insights",
        `select=*&entity_key=eq.${encodeURIComponent(domain)}&order=generated_at.desc&limit=50`,
      );
      const items = await Promise.all(insights.map(async (insight) => ({ insight, outcome: await outcomeFor(insight.id) })));
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok: true, entity_key: domain, items });
    } catch (e) {
      console.error("recommendation read failed:", e?.message || e);
      return res.status(500).json({ ok: false, error: "Could not load recommendations." });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = readBody(req);
  const action = clean(body.action, 40);
  const now = new Date().toISOString();

  try {
    if (action === "accept") {
      const domain = normDomain(body.entity_key || body.domain || "");
      const sourceCard = body.card && typeof body.card === "object" ? body.card : {};
      const type = clean(sourceCard.type, 20);
      const headline = clean(sourceCard.headline, 500);
      if (!domain || !DOMAIN_RE.test(domain) || !TYPES.has(type) || !headline) throw new Error("A valid domain and recommendation card are required.");

      const existing = await sbSelect(
        "bi_insights",
        `select=*&entity_key=eq.${encodeURIComponent(domain)}&headline=eq.${encodeURIComponent(headline)}&status=in.(active,accepted)&order=generated_at.desc&limit=1`,
      );
      if (existing[0]) {
        await sbUpdate("bi_insights", `id=eq.${existing[0].id}`, { status: "accepted" });
        const outcome = await ensureOutcome(existing[0].id, { accepted_at: now });
        return res.status(200).json({ ok: true, insight: { ...existing[0], status: "accepted" }, outcome, reused: true });
      }

      const created = await sbInsertReturning("bi_insights", {
        entity_key: domain,
        insight_type: type,
        headline,
        body: clean(sourceCard.body, 4000) || null,
        recommendation: clean(sourceCard.recommendation, 4000) || null,
        confidence: ["low", "medium", "high"].includes(sourceCard.confidence) ? sourceCard.confidence : "low",
        evidence: sourceCard.evidence && typeof sourceCard.evidence === "object" ? sourceCard.evidence : {},
        generated_at: sourceCard.generated_at || now,
        status: "accepted",
      });
      const insight = created[0];
      const outcome = await ensureOutcome(insight.id, { accepted_at: now });
      return res.status(201).json({ ok: true, insight, outcome, reused: false });
    }

    const insightId = clean(body.insight_id, 80);
    if (!UUID_RE.test(insightId)) throw new Error("A valid insight_id is required.");

    if (action === "implemented") {
      const outcome = await ensureOutcome(insightId, { implemented_at: now, measurement_start: now });
      return res.status(200).json({ ok: true, insight_id: insightId, outcome });
    }

    if (action === "measured") {
      const result = clean(body.result, 40);
      if (!RESULTS.has(result)) throw new Error("Choose a valid measurement result.");
      const lift = body.measured_lift == null || body.measured_lift === "" ? null : Number(body.measured_lift);
      if (lift != null && !Number.isFinite(lift)) throw new Error("measured_lift must be numeric.");
      await sbUpdate("bi_insights", `id=eq.${insightId}`, { status: "measured" });
      const outcome = await ensureOutcome(insightId, {
        measurement_end: now,
        result,
        measured_lift: lift,
        notes: clean(body.notes, 4000) || null,
        updated_at: now,
      });
      return res.status(200).json({ ok: true, insight_id: insightId, outcome });
    }

    if (action === "dismissed") {
      await sbUpdate("bi_insights", `id=eq.${insightId}`, { status: "dismissed" });
      return res.status(200).json({ ok: true, insight_id: insightId, status: "dismissed" });
    }

    throw new Error("Unsupported recommendation action.");
  } catch (e) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
}
