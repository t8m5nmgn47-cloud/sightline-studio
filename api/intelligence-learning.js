// GET /api/intelligence-learning?domain=example.com
// Admin-only measured recommendation scorecard and timeline.

import { sbSelect } from "./_lib.js";
import { normDomain } from "./_audit.js";
import { buildLearningMemory } from "./_learning_memory.js";

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const domain = normDomain(req.query?.domain || "");
  if (!domain || !DOMAIN_RE.test(domain)) {
    return res.status(400).json({ ok: false, error: "Enter a valid domain." });
  }

  try {
    const insights = await sbSelect(
      "bi_insights",
      `select=id,entity_key,insight_type,headline,confidence,evidence,generated_at,status&entity_key=eq.${encodeURIComponent(domain)}&order=generated_at.desc&limit=200`,
    );

    let outcomes = [];
    const ids = insights.map((insight) => insight.id).filter(Boolean);
    if (ids.length) {
      outcomes = await sbSelect(
        "bi_recommendation_outcomes",
        `select=insight_id,accepted_at,implemented_at,measurement_start,measurement_end,result,measured_lift,notes&insight_id=in.(${ids.join(",")})&order=measurement_end.desc&limit=200`,
      );
    }

    const memory = buildLearningMemory({ insights, outcomes });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, entity_key: domain, ...memory });
  } catch (e) {
    console.error("learning memory failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "Could not build recommendation learning memory." });
  }
}
