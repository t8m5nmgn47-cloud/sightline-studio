// GET /api/intelligence?domain=example.com
// Admin-only via middleware. Reads immutable BI history and returns a transparent
// Repeat / Fix / Test / Watch opportunity feed.

import { sbSelect } from "./_lib.js";
import { normDomain } from "./_audit.js";
import { buildOpportunityFeed } from "./_intelligence.js";

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

function isMissingTableError(message) {
  return /PGRST205|does not exist|not find the table|schema cache/i.test(message || "");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const domain = normDomain(req.query?.domain || "");
  if (!domain || !DOMAIN_RE.test(domain)) {
    return res.status(400).json({ ok: false, error: "Enter a valid domain, e.g. example.com" });
  }

  try {
    const entity = encodeURIComponent(domain);
    const [observations, events] = await Promise.all([
      sbSelect(
        "bi_observations",
        `select=metric,value_numeric,value_text,observed_at,source,dimensions&entity_key=eq.${entity}&order=observed_at.asc&limit=2000`,
      ),
      sbSelect(
        "bi_events",
        `select=event_type,occurred_at,channel,campaign_id,offer_id,creative_id,local_weekday,local_hour,value_numeric,metadata&entity_key=eq.${entity}&order=occurred_at.asc&limit=3000`,
      ),
    ]);

    const feed = buildOpportunityFeed({ entityKey: domain, observations, events });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, ...feed });
  } catch (e) {
    const message = String(e?.message || e);
    if (isMissingTableError(message)) {
      return res.status(503).json({
        ok: false,
        setup_required: true,
        error: "BI tables are not installed yet. Run sql/sightline_bi_foundation.sql in the Sightline Supabase project.",
      });
    }
    console.error("intelligence feed failed:", message);
    return res.status(500).json({ ok: false, error: "Could not build the intelligence feed." });
  }
}
