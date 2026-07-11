// Shared orchestration for manual and scheduled Signal Network collection.

import { sbSelect } from "./_lib.js";
import { normDomain } from "./_audit.js";
import { canonicalDomainIdentity, domainAliases, resolveDomainRecord } from "./_domain_identity.js";
import { assessPeerSet } from "./_peer_quality.js";
import { collectDeepPublicSignals, sourceKey } from "./_signals.js";
import { collectYouTubeSignals } from "./_social_signals.js";
import { collectExternalSignals } from "./_external_signals.js";
import { persistSignalBundle } from "./_signal_store.js";

export async function resolveSignalAuditContext(domain) {
  const select = "domain,name,vertical,competitors,updated_at";
  const aliases = domainAliases(domain);
  const direct = (await Promise.all(aliases.map((alias) => sbSelect(
    "prospect_audits",
    `select=${select}&domain=ilike.${encodeURIComponent(alias)}&order=updated_at.desc&limit=1`,
  )))).flat();
  let prospect = resolveDomainRecord(direct, domain);
  if (!prospect) {
    const rows = await sbSelect("prospect_audits", `select=${select}&order=updated_at.desc&limit=1000`);
    prospect = resolveDomainRecord(rows, domain);
  }
  return prospect;
}

export function candidateSignalDomains(input) {
  const normalized = normDomain(input || "");
  const canonical = canonicalDomainIdentity(normalized) || normalized;
  if (!canonical) return [];
  const candidates = normalized.startsWith("www.")
    ? [normalized, canonical]
    : [normalized, `www.${canonical}`];
  return [...new Set(candidates.filter((value) => /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value)))];
}

export function preserveBlockedWebsiteEvidence(bundle = {}, options = {}) {
  if (!bundle?.summary?.robots_blocked) return bundle;
  const sources = Array.isArray(bundle.sources) ? bundle.sources : [];
  if (sources.some((source) => source?.source_type === "website")) return bundle;

  const entityKey = canonicalDomainIdentity(bundle.entity_key || options.domain || "")
    || normDomain(bundle.entity_key || options.domain || "");
  if (!entityKey) return bundle;
  const relationship = ["owned", "peer", "market"].includes(options.relationship)
    ? options.relationship
    : (bundle.relationship || "owned");
  const source = {
    entity_key: entityKey,
    entity_name: options.name || bundle.entity_name || entityKey,
    source_type: "website",
    platform: "web",
    source_url: `https://${entityKey}/`,
    external_id: entityKey,
    handle: null,
    relationship,
    status: "blocked",
    match_confidence: 1,
    metadata: {
      robots_blocked: true,
      access_state: "robots_disallowed",
      match_method: relationship === "owned" ? "domain_identity" : "peer_set",
      caveat: "robots.txt disallows automated collection of the site root",
    },
  };
  return {
    ...bundle,
    entity_key: entityKey,
    relationship,
    sources: [{ ...source, source_key: sourceKey(source) }, ...sources],
  };
}

function mergeUnique(rows = [], key = "source_key") {
  const byKey = new Map();
  for (const row of rows) {
    const value = row?.[key];
    if (!value) continue;
    byKey.set(value, { ...(byKey.get(value) || {}), ...row });
  }
  return [...byKey.values()];
}

export function assessCollectedTarget(bundle = {}) {
  const sources = Array.isArray(bundle.sources) ? bundle.sources : [];
  const items = Array.isArray(bundle.items) ? bundle.items : [];
  const snapshots = Array.isArray(bundle.snapshots) ? bundle.snapshots : [];
  const websiteSources = sources.filter((source) => source?.source_type === "website");
  const blockedWebsiteSources = websiteSources.filter((source) => source?.status === "blocked").length;
  const webPages = items.filter((item) => item?.item_type === "web_page").length;
  const externalSources = sources.filter((source) => ["review_profile", "social_profile", "search_query", "news_feed", "job_feed", "ad_library"].includes(source?.source_type));
  const externalSnapshots = snapshots.filter((row) => /^(local_|search_|social_)/.test(row?.signal_key || "")).length;
  const websiteUsable = websiteSources.some((source) => source?.status !== "blocked") && webPages > 0;
  const blocked = !websiteUsable && blockedWebsiteSources > 0;
  const externalObserved = externalSources.length > 0 && externalSnapshots > 0;
  return {
    ok: websiteUsable,
    blocked,
    external_observed: externalObserved,
    observed: websiteUsable || blocked || externalObserved,
    website_sources: websiteSources.length,
    blocked_website_sources: blockedWebsiteSources,
    web_pages: webPages,
    external_sources: externalSources.length,
    external_snapshots: externalSnapshots,
    errors: Array.isArray(bundle.errors) ? bundle.errors : [],
  };
}

async function collectTarget({ domain, name, relationship, anchorEntityKey, maxPages }) {
  let bundle = null;
  const attempts = [];

  for (const candidate of candidateSignalDomains(domain)) {
    const currentRaw = await collectDeepPublicSignals(candidate, { entityName: name, relationship, maxPages });
    const current = preserveBlockedWebsiteEvidence(currentRaw, { domain: candidate, name, relationship });
    const assessment = assessCollectedTarget(current);
    attempts.push({ domain: candidate, ...assessment });
    if (!bundle || (current.sources?.length || 0) > (bundle.sources?.length || 0)) bundle = current;
    if (assessment.ok) { bundle = current; break; }
  }

  bundle ||= {
    entity_key: canonicalDomainIdentity(domain) || normDomain(domain),
    entity_name: name || domain,
    relationship,
    collected_at: new Date().toISOString(),
    sources: [], snapshots: [], items: [],
    errors: ["No public website collection candidate could be evaluated."],
    summary: { pages: 0, social_profiles: 0 },
  };
  bundle.anchor_entity_key = anchorEntityKey;
  bundle.errors = [...new Set([...(bundle.errors || []), ...attempts.flatMap((attempt) => attempt.errors || [])])];
  bundle.warnings = Array.isArray(bundle.warnings) ? bundle.warnings : [];

  // External providers are enabled for the owned business by default. Peer
  // enrichment can be explicitly enabled to control API cost and rate usage.
  const collectExternal = relationship === "owned" || process.env.SIGNAL_EXTERNAL_PEERS === "true";
  if (collectExternal) {
    const external = await collectExternalSignals({
      entityKey: canonicalDomainIdentity(domain) || normDomain(domain),
      entityName: name || domain,
      relationship,
      observedAt: bundle.collected_at,
      existingSources: bundle.sources || [],
    });
    bundle.sources = mergeUnique([...(bundle.sources || []), ...(external.sources || [])], "source_key");
    bundle.snapshots = mergeUnique([...(bundle.snapshots || []), ...(external.snapshots || [])], "snapshot_key");
    bundle.items = mergeUnique([...(bundle.items || []), ...(external.items || [])], "item_key");
    bundle.errors.push(...(external.errors || []));
    bundle.warnings.push(...(external.warnings || []));
    bundle.summary.external_providers = external.providers || {};
  }

  // Structured post-level enrichment. V1 uses YouTube Data API when configured;
  // other platforms remain public profile evidence until a compliant structured
  // source or an authorized account connection is available.
  for (const source of (bundle.sources || []).filter((row) => row.platform === "youtube")) {
    const social = await collectYouTubeSignals(source, bundle.collected_at);
    bundle.snapshots.push(...(social.snapshots || []));
    bundle.items.push(...(social.items || []));
    bundle.errors.push(...(social.errors || []).map((error) => `youtube ${source.source_url}: ${error}`));
  }
  bundle.sources = mergeUnique(bundle.sources || [], "source_key");
  bundle.snapshots = mergeUnique(bundle.snapshots || [], "snapshot_key");
  bundle.items = mergeUnique(bundle.items || [], "item_key");
  bundle.errors = [...new Set(bundle.errors || [])];
  bundle.warnings = [...new Set(bundle.warnings || [])];
  bundle.summary.snapshots = bundle.snapshots.length;
  bundle.summary.items = bundle.items.length;
  bundle.summary.videos = bundle.items.filter((item) => item.item_type === "video").length;
  bundle.summary.external_warnings = bundle.warnings;

  const assessment = assessCollectedTarget(bundle);
  const storage = await persistSignalBundle(bundle);
  const accepted = assessment.observed && storage?.ok !== false;
  const error = assessment.observed ? null : (
    bundle.errors?.[0] || `No usable owned evidence was collected for ${canonicalDomainIdentity(domain) || normDomain(domain)}.`
  );
  return {
    ok: accepted,
    usable: assessment.ok || assessment.external_observed,
    website_usable: assessment.ok,
    externally_usable: assessment.external_observed,
    blocked: assessment.blocked,
    error,
    entity_key: bundle.entity_key,
    relationship,
    collection: bundle.summary,
    assessment,
    attempts,
    storage,
    warnings: bundle.warnings || [],
    errors: bundle.errors || [],
  };
}

export async function collectBusinessSignalNetwork(domainInput, options = {}) {
  const requested = normDomain(domainInput || "");
  if (!requested || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(requested)) {
    throw new Error("Enter a valid business domain.");
  }

  let prospect = null;
  try { prospect = await resolveSignalAuditContext(requested); }
  catch (error) { console.error("Signal prospect context unavailable:", error?.message || error); }

  const anchorEntityKey = canonicalDomainIdentity(prospect?.domain || requested) || requested;
  const results = [];
  const owned = await collectTarget({
    domain: anchorEntityKey,
    name: prospect?.name || anchorEntityKey,
    relationship: "owned",
    anchorEntityKey,
    maxPages: Math.max(1, Math.min(20, Number(options.maxPages) || 10)),
  });
  results.push(owned);

  let peerSet = { confidence: "low", eligible_count: 0, suppressed_count: 0, eligible: [] };
  if (options.includePeers === true) {
    peerSet = assessPeerSet(prospect?.vertical || "", prospect?.competitors || []);
    const peers = peerSet.eligible.slice(0, Math.max(0, Math.min(5, Number(options.maxPeers) || 3)));
    for (const peer of peers) {
      const peerDomain = normDomain(peer?.domain || "");
      if (!peerDomain) continue;
      results.push(await collectTarget({
        domain: peerDomain,
        name: peer?.name || peerDomain,
        relationship: "peer",
        anchorEntityKey,
        maxPages: Math.max(1, Math.min(8, Number(options.peerMaxPages) || 4)),
      }));
    }
  }

  const setupRequired = results.some((result) => result.storage?.setup_required);
  const failedPeers = results.filter((result) => result.relationship === "peer" && !result.ok);
  const ok = !setupRequired && owned.ok;
  const ownedWarnings = owned.blocked
    ? [`${owned.entity_key}: website collection is blocked by robots.txt; external-source collection continued.`]
    : [];
  return {
    ok,
    partial: ok && (owned.blocked || owned.errors.length > 0 || failedPeers.length > 0),
    degraded: owned.blocked || !owned.website_usable,
    setup_required: setupRequired,
    error: ok ? null : (owned.error || "Owned business collection did not produce usable evidence."),
    warnings: [
      ...ownedWarnings,
      ...(owned.warnings || []),
      ...failedPeers.map((result) => `${result.entity_key}: ${result.error || "peer collection failed"}`),
    ],
    providers: owned.collection?.external_providers || {},
    anchor_entity_key: anchorEntityKey,
    targets_collected: results.filter((result) => result.ok).length,
    targets_usable: results.filter((result) => result.usable).length,
    targets_attempted: results.length,
    peer_set: {
      confidence: peerSet.confidence,
      eligible_peers: peerSet.eligible_count,
      suppressed_peers: peerSet.suppressed_count,
    },
    results,
  };
}
