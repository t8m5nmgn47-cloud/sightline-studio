// External Signal Acquisition v1.1 — low-cost supported API collectors.
// Geoapify provides local identity and place metadata; Brave provides
// independent social discovery. No Google scraping or access-control bypass.

import { normDomain } from "./_audit.js";
import { sourceKey, stableHash } from "./_signals.js";
import { collectBraveSocialDiscovery, scoreSocialSearchResult } from "./_brave_social_signals.js";
import { collectGeoapifyLocalSignals, scoreGeoapifyCandidate } from "./_geoapify_signals.js";

export { collectBraveSocialDiscovery, collectGeoapifyLocalSignals, scoreGeoapifyCandidate, scoreSocialSearchResult };

function geoapifyLookupEvidence(input = {}, local = {}) {
  if (local?.provider?.status !== "active") return { sources: [], snapshots: [] };
  const entityKey = normDomain(input.entityKey || "").replace(/^www\./, "");
  const entityName = String(input.entityName || entityKey).trim();
  const observedAt = input.observedAt || new Date().toISOString();
  const query = `Geoapify amenity lookup: ${entityName}`;
  const source = {
    entity_key: entityKey,
    entity_name: entityName,
    source_type: "search_query",
    platform: "geoapify_geocoding",
    source_url: "",
    external_id: stableHash(query),
    handle: null,
    relationship: input.relationship || "owned",
    status: "active",
    match_confidence: Number(local.provider.match_confidence || 0),
    metadata: {
      provider: "geoapify_geocoding_place_details",
      query,
      match_method: "supported_api_lookup",
      place_id: local.provider.place_id || null,
      requests_used: local.provider.requests_used || null,
    },
  };
  source.source_key = sourceKey(source);
  const value = Number(local.provider.match_confidence || 0);
  const snapshot = {
    snapshot_key: stableHash([source.source_key, "local_match_confidence", value, String(observedAt).slice(0, 10)].join("|")),
    source_key: source.source_key,
    entity_key: entityKey,
    signal_key: "local_match_confidence",
    value_numeric: value,
    value_text: null,
    observed_at: observedAt,
    dimensions: { provider: "geoapify" },
    provenance: {
      provider: "geoapify_geocoding_place_details",
      place_id: local.provider.place_id || null,
      caveat: "identity-match confidence; not review or conversion data",
    },
  };
  return { sources: [source], snapshots: [snapshot] };
}

export async function collectExternalSignals(input = {}) {
  const existingPlatforms = (Array.isArray(input.existingSources) ? input.existingSources : [])
    .filter((source) => source?.source_type === "social_profile")
    .map((source) => source.platform)
    .filter(Boolean);
  const local = await collectGeoapifyLocalSignals(input);
  const lookup = geoapifyLookupEvidence(input, local);
  const social = await collectBraveSocialDiscovery({ ...input, existingPlatforms });
  return {
    sources: [...local.sources, ...lookup.sources, ...social.sources],
    snapshots: [...local.snapshots, ...lookup.snapshots, ...social.snapshots],
    items: [...local.items, ...social.items],
    errors: [...local.errors, ...social.errors],
    warnings: [...local.warnings, ...social.warnings],
    providers: { geoapify_local: local.provider, brave_social_search: social.provider },
  };
}
