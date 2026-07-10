// GET /api/signal-ledger?domain=example.com
// Protected by admin middleware. Returns source coverage, freshness, and evidence
// acquisition status without exposing raw credentials or private source data.

import { normDomain } from "./_audit.js";
import { readSignalLedger } from "./_signal_store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const domain = normDomain(req.query?.domain || "");
  if (!domain || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ ok: false, error: "Enter a valid business domain." });
  }
  try {
    const result = await readSignalLedger(domain);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(result.setup_required ? 503 : 200).json(result);
  } catch (error) {
    console.error("Signal ledger failed:", error?.message || error);
    return res.status(500).json({ ok: false, error: "Could not load the Evidence Ledger." });
  }
}
