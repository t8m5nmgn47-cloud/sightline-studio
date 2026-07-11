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

async function collectTarget({ domain, name, relationship, anchorEntityKey, maxPages }) {
  const bundle = await collectDeepPublicSignals(domain, { entityName: name, relationship, maxPages });
  bundle.anchor_entity_key = anchorEntityKey;

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

  const storage = await persistSignalBundle(bundle);
  return {
    entity_key: bundle.entity_key,
    relationship,
    collection: bundle.summary,
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
  results.push(await collectTarget({
    domain: anchorEntityKey,
    name: prospect?.name || anchorEntityKey,
    relationship: "owned",
    anchorEntityKey,
    maxPages: Math.max(1, Math.min(20, Number(options.maxPages) || 10)),
  }));

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
  return {
    ok: !setupRequired && results.every((result) => result.storage?.ok !== false),
    setup_required: setupRequired,
    anchor_entity_key: anchorEntityKey,
    targets_collected: results.length,
    peer_set: {
      confidence: peerSet.confidence,
      eligible_peers: peerSet.eligible_count,
      suppressed_peers: peerSet.suppressed_count,
    },
    results,
  };
}
