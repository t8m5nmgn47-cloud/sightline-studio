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

function dayCount(rows = []) {
  return new Set(rows.map((row) => String(row?.observed_at || "").slice(0, 10)).filter(Boolean)).size;
}

function domainCard(key, label, state, evidence, next) {
  return { key, label, state, evidence, next };
}

export function enforceOwnedLedgerTruth(result = {}) {
  const ledger = result?.ledger;
  if (!ledger?.summary) return result;

  const sources = Array.isArray(ledger.sources) ? ledger.sources : [];
  const snapshots = Array.isArray(ledger.recent_snapshots) ? ledger.recent_snapshots : [];
  const ownedSources = sources.filter((source) => (source.relationship || "owned") === "owned");
  const ownedIds = new Set(ownedSources.map((source) => source.id).filter(Boolean));
  const ownedSnapshots = snapshots.filter((row) => row?.source_id && ownedIds.has(row.source_id));
  const latestOwnedSnapshotAt = ownedSnapshots
    .map((row) => row.observed_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const latestOwnedAge = ageDays(latestOwnedSnapshotAt);

  const ownedWebsiteSources = ownedSources.filter((source) => source.source_type === "website");
  const ownedLocalSources = ownedSources.filter((source) => source.source_type === "review_profile" && source.platform === "google_business_profile");
  const ownedSocialSources = ownedSources.filter((source) => source.source_type === "social_profile");
  const ownedSearchSources = ownedSources.filter((source) => source.source_type === "search_query");
  const websiteIds = new Set(ownedWebsiteSources.map((source) => source.id).filter(Boolean));
  const localIds = new Set(ownedLocalSources.map((source) => source.id).filter(Boolean));
  const socialIds = new Set(ownedSocialSources.map((source) => source.id).filter(Boolean));
  const websiteSnapshots = ownedSnapshots.filter((row) => websiteIds.has(row.source_id));
  const localSnapshots = ownedSnapshots.filter((row) => localIds.has(row.source_id));
  const socialSnapshots = ownedSnapshots.filter((row) => socialIds.has(row.source_id));
  const websiteDays = dayCount(websiteSnapshots);
  const localDays = dayCount(localSnapshots);
  const socialDays = dayCount(socialSnapshots);
  const blockedWebsite = ownedWebsiteSources.find((source) => (
    source.status === "blocked" && source.metadata?.robots_blocked === true
  ));
  const verifiedSocial = ownedSocialSources.filter((source) => source.status === "active" && Number(source.match_confidence || 0) >= 0.8).length;
  const candidateSocial = ownedSocialSources.filter((source) => source.status === "discovered" && Number(source.match_confidence || 0) >= 0.68).length;
  const localRating = localSnapshots.find((row) => row.signal_key === "local_rating")?.value_numeric;
  const localReviewCount = localSnapshots.find((row) => row.signal_key === "local_review_count")?.value_numeric;

  const existingDomains = new Map((Array.isArray(ledger.domains) ? ledger.domains : []).map((domain) => [domain.key, domain]));
  const publicWeb = blockedWebsite
    ? domainCard("public_web", "Public web history", "blocked", "Owned website collection is blocked by robots.txt", "Continue with external public sources or obtain first-party permission before crawling the website.")
    : domainCard(
      "public_web",
      "Public web history",
      websiteDays >= 3 ? "ready" : websiteDays >= 1 ? "developing" : "not_ready",
      `${websiteDays} owned website collection day${websiteDays === 1 ? "" : "s"}`,
      websiteDays >= 3 ? "Continue collection for change detection." : "Collect comparable website snapshots on additional days.",
    );
  const localPresence = domainCard(
    "local_presence",
    "Local presence",
    localDays >= 2 && localSnapshots.length >= 4 ? "developing" : localDays >= 1 ? "developing" : "not_ready",
    ownedLocalSources.length
      ? `${ownedLocalSources.length} Google profile · rating ${localRating ?? "—"} · ${localReviewCount ?? "—"} reviews`
      : "No matched Google local profile yet",
    localDays >= 2 ? "Continue snapshots to measure rating and review-count movement." : "Connect Google Places collection and verify the matched local listing.",
  );
  const socialIdentity = domainCard(
    "social_identity",
    "Social identity",
    verifiedSocial >= 2 ? "ready" : (verifiedSocial + candidateSocial) >= 1 ? "developing" : "not_ready",
    `${verifiedSocial} verified · ${candidateSocial} discovery candidate${candidateSocial === 1 ? "" : "s"}`,
    candidateSocial ? "Verify discovered candidates before treating them as official accounts." : "Discover and verify public social profiles independently of the website.",
  );
  const socialMovement = domainCard(
    "social_movement",
    "Social movement",
    socialSnapshots.length >= 6 && socialDays >= 2 ? "developing" : "not_ready",
    `${socialSnapshots.length} profile measurements across ${socialDays} day${socialDays === 1 ? "" : "s"}`,
    "Accumulate repeated public profile measurements and post-level history.",
  );

  const orderedKeys = ["public_web", "local_presence", "social_identity", "social_movement", "content_inventory", "peer_context"];
  const replacements = new Map([
    ["public_web", publicWeb],
    ["local_presence", localPresence],
    ["social_identity", socialIdentity],
    ["social_movement", socialMovement],
  ]);
  const domains = orderedKeys.map((key) => replacements.get(key) || existingDomains.get(key)).filter(Boolean);

  let warning = result.warning || null;
  if (blockedWebsite) {
    warning = ownedLocalSources.length || ownedSearchSources.length || ownedSocialSources.length
      ? "The website blocks crawling, but Sightline is collecting separate owned external evidence."
      : "The owned website blocks automated collection through robots.txt. Sightline recorded the block but did not crawl the site.";
  } else if (ownedSources.length === 0) {
    warning = "Peer evidence exists, but the owned business has not produced usable evidence yet.";
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
        owned_access_status: blockedWebsite ? "blocked" : ownedWebsiteSources.length ? "available" : "missing",
        website_collection_days: websiteDays,
        local_collection_days: localDays,
        social_collection_days: socialDays,
        local_measurements: localSnapshots.length,
        independent_search_sources: ownedSearchSources.length,
        verified_social_profiles: verifiedSocial,
        candidate_social_profiles: candidateSocial,
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
