// GET /api/admin-dashboard
// Private operating command center for Sightline Admin.

import { sbSelect } from "./_lib.js";
import { buildPortfolioTriage } from "./_portfolio_intelligence.js";
import { buildAdminDashboard } from "./_admin_dashboard.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const [subscribers, signups, leads, prospects, observations, events, insights, outcomes] = await Promise.all([
      sbSelect("subscribers", "select=*&order=created_at.desc&limit=500"),
      sbSelect("signups", "select=*&limit=1000"),
      sbSelect("leads", "select=*&limit=1000"),
      sbSelect("prospect_audits", "select=slug,name,domain,vertical,score,field_avg,rank,count,top_gap,updated_at,competitors&order=updated_at.desc&limit=500"),
      sbSelect("bi_observations", "select=entity_key,metric,value_numeric,value_text,observed_at,source,dimensions&order=observed_at.desc&limit=10000"),
      sbSelect("bi_events", "select=entity_key,event_type,occurred_at,channel,campaign_id,offer_id,creative_id,value_numeric,metadata&order=occurred_at.desc&limit=10000"),
      sbSelect("bi_insights", "select=id,entity_key,insight_type,status,headline,confidence,evidence,generated_at,review_after&order=generated_at.desc&limit=5000"),
      sbSelect("bi_recommendation_outcomes", "select=insight_id,accepted_at,implemented_at,measurement_start,measurement_end,result,measured_lift,notes&order=measurement_end.desc&limit=5000"),
    ]);

    const portfolio = buildPortfolioTriage({ prospects, observations, events, insights });
    const dashboard = buildAdminDashboard({ subscribers, signups, leads, portfolio, events, insights, outcomes, prospects, observations });

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, ...dashboard });
  } catch (error) {
    console.error("admin dashboard failed:", error?.message || error);
    return res.status(500).json({ ok: false, error: "Could not load the admin dashboard." });
  }
}
