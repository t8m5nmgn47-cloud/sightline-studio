// GET /api/intelligence-refresh
// Scheduled after the daily audit refresh. Converts fresh measured history into
// stored actionable insights without duplicating unchanged recommendations.

import { notifySlack, sbInsert, sbSelect, sbUpdate } from "./_lib.js";
import { normDomain } from "./_audit.js";
import { loadIntelligenceFeed } from "./_bi_feed.js";
import { planInsightRefresh } from "./_insight_refresh.js";
import { buildOperatorDigest } from "./_operator_digest.js";

const BATCH = 12;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: "CRON_SECRET not configured" });
  if ((req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: "unauthorized" });

  let prospects;
  try {
    prospects = await sbSelect(
      "prospect_audits",
      `select=slug,name,domain,updated_at&order=updated_at.desc&limit=${BATCH}`,
    );
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }

  const generatedAt = new Date().toISOString();
  const results = [];

  for (const prospect of prospects || []) {
    const domain = normDomain(prospect.domain || "");
    if (!domain) continue;

    try {
      const feed = await loadIntelligenceFeed(domain);
      const existing = await sbSelect(
        "bi_insights",
        `select=id,headline,status,generated_at&entity_key=eq.${encodeURIComponent(domain)}&order=generated_at.desc&limit=200`,
      );
      const plan = planInsightRefresh({ entityKey: domain, feed, existing, generatedAt });

      if (plan.create.length) await sbInsert("bi_insights", plan.create);
      for (const id of plan.expire) {
        await sbUpdate("bi_insights", `id=eq.${encodeURIComponent(id)}`, { status: "expired" });
      }

      results.push({
        slug: prospect.slug,
        name: prospect.name || domain,
        domain,
        actionable: plan.actionable_count,
        created: plan.create.length,
        unchanged: plan.unchanged.length,
        expired: plan.expire.length,
        new_insights: plan.create.map((row) => ({
          type: row.insight_type,
          headline: row.headline,
          confidence: row.confidence,
        })),
      });
    } catch (e) {
      results.push({
        slug: prospect.slug,
        name: prospect.name || domain,
        domain,
        error: String(e?.message || e),
      });
    }
  }

  const digest = buildOperatorDigest(results, {
    baseUrl: process.env.PUBLIC_SITE_URL || "https://sightline-studio.vercel.app",
  });
  if (digest.should_notify) await notifySlack(digest.text);

  return res.status(200).json({
    ok: true,
    generated_at: generatedAt,
    processed: results.length,
    created: digest.created,
    expired: digest.expired,
    errors: digest.errors,
    digest_notified: digest.should_notify,
    results,
  });
}
