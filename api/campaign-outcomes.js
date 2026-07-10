// GET /api/campaign-outcomes?domain=example.com
// POST /api/campaign-outcomes to finalize one pending campaign result exactly once.

import { readBody, sbInsert, sbSelect } from "./_lib.js";
import { normDomain } from "./_audit.js";
import { requireAdmin } from "./_admin_auth.js";
import { campaignCompletionEvents, foldCampaignOutcomeQueue } from "./_campaign_outcomes.js";

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

async function campaignEvents(domain, campaignId = null) {
  let query = `select=entity_key,event_type,occurred_at,channel,campaign_id,offer_id,creative_id,value_numeric,metadata&entity_key=eq.${encodeURIComponent(domain)}`;
  if (campaignId) query += `&campaign_id=eq.${encodeURIComponent(campaignId)}`;
  query += "&order=occurred_at.asc&limit=2000";
  return sbSelect("bi_events", query);
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET") {
    const domain = normDomain(req.query?.domain || "");
    if (!domain || !DOMAIN_RE.test(domain)) return res.status(400).json({ ok: false, error: "Enter a valid domain." });
    try {
      const events = await campaignEvents(domain);
      const campaigns = foldCampaignOutcomeQueue(events);
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({
        ok: true,
        entity_key: domain,
        summary: {
          campaigns: campaigns.length,
          pending: campaigns.filter((c) => c.status === "pending").length,
          finalized: campaigns.filter((c) => c.status === "finalized").length,
        },
        campaigns,
      });
    } catch (e) {
      console.error("campaign outcome queue read failed:", e?.message || e);
      return res.status(500).json({ ok: false, error: "Could not load campaign outcome queue." });
    }
  }

  if (req.method === "POST") {
    try {
      const body = readBody(req);
      const domain = normDomain(body.entity_key || body.domain || "");
      const campaignId = String(body.campaign_id || "").trim().slice(0, 160);
      if (!domain || !DOMAIN_RE.test(domain)) return res.status(400).json({ ok: false, error: "Enter a valid domain." });
      if (!campaignId) return res.status(400).json({ ok: false, error: "campaign_id is required." });

      const existingEvents = await campaignEvents(domain, campaignId);
      const campaign = foldCampaignOutcomeQueue(existingEvents)[0];
      if (!campaign) return res.status(404).json({ ok: false, error: "Campaign send not found." });
      const occurredAt = body.occurred_at ? new Date(body.occurred_at).toISOString() : new Date().toISOString();
      const rows = campaignCompletionEvents(
        { ...campaign, entity_key: domain },
        { bookings: body.bookings, revenue: body.revenue, notes: body.notes },
        occurredAt,
      );
      await sbInsert("bi_events", rows);
      return res.status(201).json({
        ok: true,
        entity_key: domain,
        campaign_id: campaignId,
        inserted: rows.length,
        result: { bookings: Number(body.bookings), revenue: Number(body.revenue) },
      });
    } catch (e) {
      return res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
