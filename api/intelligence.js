// GET /api/intelligence?domain=example.com
// Admin-only via middleware. Reads immutable BI history and returns a transparent
// Repeat / Fix / Test / Watch opportunity feed with campaign, review, peer and
// recommendation-tracking context.

import { normDomain } from "./_audit.js";
import { loadIntelligenceFeed } from "./_bi_feed.js";

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
    const feed = await loadIntelligenceFeed(domain);
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
