// POST /api/signal-collect
// Protected by admin middleware. Collects bounded public signals for one business
// and, optionally, a quality-approved peer set.

import { readBody, sbSelect } from "./_lib.js";
import { normDomain } from "./_audit.js";
import { collectBusinessSignalNetwork } from "./_signal_orchestrator.js";
import { signalSchemaMissing } from "./_signal_store.js";

export function signalCollectionHttpStatus(result = {}) {
  if (result.setup_required) return 503;
  if (result.ok) return 200;
  // 207 is a successful 2xx response in fetch(). The Evidence Ledger treated
  // incomplete owned collection as success, reloaded stale data, and hid the
  // actual collection error. Use a non-2xx status for unusable owned evidence.
  return 422;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = readBody(req);
  const requested = normDomain(body.domain || body.entity_key || "");
  if (!requested || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(requested)) {
    return res.status(400).json({ ok: false, error: "Enter a valid business domain." });
  }

  try {
    // Fail before network collection if the signal schema has not been installed.
    try { await sbSelect("signal_sources", "select=id&limit=1"); }
    catch (error) {
      if (signalSchemaMissing(error)) return res.status(503).json({ ok: false, setup_required: true, error: "Signal Network schema is not installed." });
      throw error;
    }

    const result = await collectBusinessSignalNetwork(requested, {
      includePeers: body.include_peers === true,
      maxPages: body.max_pages,
      peerMaxPages: body.peer_max_pages,
      maxPeers: body.max_peers,
    });

    if (!result.ok) {
      const owned = (result.results || []).find((row) => row.relationship === "owned");
      console.warn("Signal owned collection incomplete:", JSON.stringify({
        domain: requested,
        error: result.error || null,
        attempts: owned?.attempts || [],
        assessment: owned?.assessment || null,
      }));
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(signalCollectionHttpStatus(result)).json(result);
  } catch (error) {
    console.error("Signal collection failed:", error?.message || error);
    return res.status(500).json({ ok: false, error: String(error?.message || "Signal collection failed.") });
  }
}
