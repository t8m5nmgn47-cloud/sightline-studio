// Shared orchestration for manual and scheduled Signal Network collection.

import { sbSelect } from "./_lib.js";
import { normDomain } from "./_audit.js";
import { canonicalDomainIdentity, domainAliases, resolveDomainRecord } from "./_domain_identity.js";
import { assessPeerSet } from "./_peer_quality.js";
import { collectDeepPublicSignals } from "./_signals.js";
import { collectYouTubeSignals } from "./_social_signals.js";
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

export function assessCollectedTarget(bundle = {}) {
  const sources = Array.isArray(bundle.sources) ? bundle.sources : [];
  const items = Array.isArray(bundle.items) ? bundle.items : [];
  const websiteSources = sources.filter((source) => source?.source_type === "website").length;
  const webPages = items.filter((item) => item?.item_type === "web_page").length;
  return {
    ok: websiteSources > 0 && webPages > 0,
    website_sources: websiteSources,
    web_pages: webPages,
    errors: Array.isArray(bundle.errors) ? bundle.errors : [],
  };
}

async function collectTarget({ domain, name, relationship, anchorEntityKey, maxPages }) {
  let bundle = null;
  const attempts = [];

  for (const candidate of candidateSignalDomains(domain)) {
    const current = await collectDeepPublicSignals(candidate, { entityName: name, relationship, maxPages });
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
    errors: ["No public collection candidate could be evaluated."],
    summary: { pages: 0, social_profiles: 0 },
  };
  bundle.anchor_entity_key = anchorEntityKey;
  bundle.errors = [...new Set([...(bundle.errors || []), ...attempts.flatMap((attempt) => attempt.errors || [])])];

  // Structured post-level enrichment. V1 uses YouTube Data API when configured;
  // other platforms remain public profile evidence until a compliant structured
  // source or an authorized account connection is available.
  for (const source of (bundle.sources || []).filter((row) => row.platform === "youtube")) {
    const social = await collectYouTubeSignals(source, bundle.collected_at);
    bundle.snapshots.push(...(social.snapshots || []));
    bundle.items.push(...(social.items || []));
    bundle.errors.push(...(social.errors || []).map((error) => `youtube ${source.source_url}: ${error}`));
  }
  bundle.summary.snapshots = bundle.snapshots.length;
  bundle.summary.items = bundle.items.length;
  bundle.summary.videos = bundle.items.filter((item) => item.item_type === "video").length;

  const assessment = assessCollectedTarget(bundle);
  const storage = await persistSignalBundle(bundle);
  const error = assessment.ok ? null : (
    bundle.errors?.[0] || `No owned website pages were collected for ${canonicalDomainIdentity(domain) || normDomain(domain)}.`
  );
  return {
    ok: assessment.ok && storage?.ok !== false,
    error,
    entity_key: bundle.entity_key,
    relationship,
    collection: bundle.summary,
    assessment,
    attempts,
    storage,
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
  return {
    ok,
    partial: ok && failedPeers.length > 0,
    setup_required: setupRequired,
    error: ok ? null : (owned.error || "Owned business collection did not produce usable website evidence."),
    warnings: failedPeers.map((result) => `${result.entity_key}: ${result.error || "peer collection failed"}`),
    anchor_entity_key: anchorEntityKey,
    targets_collected: results.filter((result) => result.ok).length,
    targets_attempted: results.length,
    peer_set: {
      confidence: peerSet.confidence,
      eligible_peers: peerSet.eligible_count,
      suppressed_peers: peerSet.suppressed_count,
    },
    results,
  };
}
