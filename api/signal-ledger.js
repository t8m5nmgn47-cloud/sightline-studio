// GET /api/signal-ledger?domain=example.com
// Protected by admin middleware. Returns source coverage, freshness, and evidence
// acquisition status without exposing raw credentials or private source data.

import { normDomain } from "./_audit.js";
import { canonicalDomainIdentity } from "./_domain_identity.js";
import { readSignalLedger } from "./_signal_store.js";

function ageDays(value, now = Date.now()) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.max(0, Math.floor((now - timestamp) / 86_400_000))
    : null;
}

function freshness(days) {
  if (days == null) return "missing";
  if (days <= 3) return "fresh";
  if (days <= 14) return "aging";
  return "stale";
}

export function enforceOwnedLedgerTruth(result = {}) {
  const ledger = result?.ledger;
  if (!ledger?.summary) return result;

  const sources = Array.isArray(ledger.sources) ? ledger.sources : [];
  const ownedSources = sources.filter((source) => (source.relationship || "owned") === "owned");
  const ownedIds = new Set(ownedSources.map((source) => source.id).filter(Boolean));
  const ownedSnapshots = (Array.isArray(ledger.recent_snapshots) ? ledger.recent_snapshots : [])
    .filter((row) => row?.source_id && ownedIds.has(row.source_id));
  const latestOwnedSnapshotAt = ownedSnapshots
    .map((row) => row.observed_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const latestOwnedAge = ageDays(latestOwnedSnapshotAt);
  const blockedWebsite = ownedSources.find((source) => (
    source.source_type === "website"
    && source.status === "blocked"
    && source.metadata?.robots_blocked === true
  ));

  const domains = (Array.isArray(ledger.domains) ? ledger.domains : []).map((domain) => {
    if (domain.key !== "public_web" || !blockedWebsite) return domain;
    return {
      ...domain,
      state: "not_ready",
      evidence: "Owned website collection is blocked by robots.txt",
      next: "Continue with external public sources or obtain first-party permission before crawling the website.",
    };
  });

  let warning = result.warning || null;
  if (blockedWebsite) {
    warning = "The owned website blocks automated collection through robots.txt. Sightline recorded the block but did not crawl the site.";
  } else if (ownedSources.length === 0) {
    warning = "Peer evidence exists, but the owned business has not produced a usable website collection yet.";
  }

  return {
    ...result,
    warning,
    ledger: {
      ...ledger,
      summary: {
        ...ledger.summary,
        latest_snapshot_at: latestOwnedSnapshotAt,
        latest_snapshot_age_days: latestOwnedAge,
        freshness: freshness(latestOwnedAge),
        owned_access_status: blockedWebsite ? "blocked" : ownedSources.length ? "available" : "missing",
      },
      domains,
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
