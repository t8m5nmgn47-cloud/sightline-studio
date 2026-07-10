// GET /api/weekly-brief?domain=example.com
// Admin-only. Generates the current decision brief from the same evidence and
// rules used by the Opportunity Feed.

import { normDomain } from "./_audit.js";
import { loadIntelligenceFeed } from "./_bi_feed.js";
import { buildWeeklyBrief } from "./_bi_patterns.js";

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const domain = normDomain(req.query?.domain || "");
  if (!domain || !DOMAIN_RE.test(domain)) return res.status(400).json({ ok: false, error: "Enter a valid domain." });

  try {
    const feed = await loadIntelligenceFeed(domain);
    const brief = buildWeeklyBrief(feed);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ ok: true, ...brief });
  } catch (e) {
    console.error("weekly brief failed:", e?.message || e);
    return res.status(500).json({ ok: false, error: "Could not build the Weekly Intelligence Brief." });
  }
}
