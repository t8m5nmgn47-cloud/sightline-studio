// GET /api/signal-ledger?domain=example.com
// Protected by admin middleware. Returns source coverage, freshness, and evidence
// acquisition status without exposing raw credentials or private source data.

import { normDomain } from "./_audit.js";
import { canonicalDomainIdentity } from "./_domain_identity.js";
import { readSignalLedger } from "./_signal_store.js";

export function enforceOwnedLedgerTruth(result = {}) {
  const ledger = result?.ledger;
  if (!ledger?.summary) return result;
  if (Number(ledger.summary.owned_source_count || 0) > 0) return result;

  return {
    ...result,
    warning: "Peer evidence exists, but the owned business has not produced a usable website collection yet.",
    ledger: {
      ...ledger,
      summary: {
        ...ledger.summary,
        latest_snapshot_at: null,
        latest_snapshot_age_days: null,
        freshness: "missing",
      },
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const domain = canonicalDomainIdentity(req.query?.domain || "") || normDomain(req.query?.domain || "");
  if (!domain || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ ok: false, error: "Enter a valid business domain." });
  }
  try {
    const result = enforceOwnedLedgerTruth(await readSignalLedger(domain));
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(result.setup_required ? 503 : 200).json(result);
  } catch (error) {
    console.error("Signal ledger failed:", error?.message || error);
    return res.status(500).json({ ok: false, error: "Could not load the Evidence Ledger." });
  }
}
