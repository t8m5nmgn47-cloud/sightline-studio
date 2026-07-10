// GET /api/intelligence-portfolio
// Admin-only portfolio triage across tracked prospect/business domains.

import { sbSelect } from "./_lib.js";
import { buildPortfolioTriage } from "./_portfolio_intelligence.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const [prospects, observations, events, insights] = await Promise.all([
      sbSelect(
        "prospect_audits",
        "select=slug,name,domain,vertical,score,updated_at,competitors&order=updated_at.desc&limit=500",
      ),
      sbSelect(
        "bi_observations",
        "select=entity_key,metric,value_numeric,value_text,observed_at,source,dimensions&order=observed_at.desc&limit=10000",
      ),
      sbSelect(
        "bi_events",
        "select=entity_key,event_type,occurred_at,channel,campaign_id,offer_id,creative_id,value_numeric,metadata&order=occurred_at.desc&limit=10000",
      ),
      sbSelect(
        "bi_insights",
        "select=entity_key,status,headline,generated_at&order=generated_at.desc&limit=5000",
      ),
    ]);

    const portfolio = buildPortfolioTriage({ prospects, observations, events, insights });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, ...portfolio });
  } catch (e) {
    console.error("intelligence portfolio failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "Could not build the intelligence portfolio." });
  }
}
