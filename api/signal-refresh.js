// GET /api/signal-refresh — scheduled Deep Signal Acquisition v1.
// Rotates through the stalest business evidence sets and collects the business
// plus a small quality-approved peer set. CRON_SECRET protected.

import { sbSelect } from "./_lib.js";
import { normDomain } from "./_audit.js";
import { canonicalDomainIdentity } from "./_domain_identity.js";
import { collectBusinessSignalNetwork } from "./_signal_orchestrator.js";
import { signalSchemaMissing } from "./_signal_store.js";

const BATCH = 2;

export function selectSignalRefreshTargets(prospects = [], runs = [], limit = BATCH) {
  const latestByAnchor = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    const key = canonicalDomainIdentity(run?.anchor_entity_key || run?.entity_key || "") || normDomain(run?.anchor_entity_key || run?.entity_key || "");
    if (!key) continue;
    const t = Date.parse(run?.started_at || 0) || 0;
    if (t > (latestByAnchor.get(key) || 0)) latestByAnchor.set(key, t);
  }
  return (Array.isArray(prospects) ? prospects : [])
    .map((row) => ({ ...row, domain: canonicalDomainIdentity(row?.domain || "") || normDomain(row?.domain || "") }))
    .filter((row) => /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(row.domain))
    .sort((a, b) => (latestByAnchor.get(a.domain) || 0) - (latestByAnchor.get(b.domain) || 0))
    .slice(0, Math.max(0, Number(limit) || BATCH));
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: "CRON_SECRET not configured" });
  if ((req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: "unauthorized" });

  try {
    try { await sbSelect("signal_sources", "select=id&limit=1"); }
    catch (error) {
      if (signalSchemaMissing(error)) return res.status(200).json({ ok: true, skipped: true, setup_required: true, reason: "Signal Network schema is not installed." });
      throw error;
    }

    const [prospects, runs] = await Promise.all([
      sbSelect("prospect_audits", "select=domain,name,updated_at&order=updated_at.desc&limit=250"),
      sbSelect("signal_collection_runs", "select=anchor_entity_key,entity_key,started_at,status&order=started_at.desc&limit=1000"),
    ]);
    const targets = selectSignalRefreshTargets(prospects, runs, BATCH);
    const results = [];
    for (const target of targets) {
      try {
        const result = await collectBusinessSignalNetwork(target.domain, {
          includePeers: true,
          maxPages: 6,
          peerMaxPages: 3,
          maxPeers: 2,
        });
        results.push({ domain: target.domain, ...result });
      } catch (error) {
        results.push({ domain: target.domain, ok: false, error: String(error?.message || error) });
      }
    }
    return res.status(200).json({ ok: true, refreshed: results.length, results });
  } catch (error) {
    console.error("Signal refresh failed:", error?.message || error);
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
