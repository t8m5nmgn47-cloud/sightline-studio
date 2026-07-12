// External Signal Acquisition v1.1 — low-cost supported API collectors.
// Geoapify provides local identity and place metadata; Brave provides
// independent social discovery. No Google scraping or access-control bypass.

import { collectBraveSocialDiscovery, scoreSocialSearchResult } from "./_brave_social_signals.js";
import { collectGeoapifyLocalSignals, scoreGeoapifyCandidate } from "./_geoapify_signals.js";

export { collectBraveSocialDiscovery, collectGeoapifyLocalSignals, scoreGeoapifyCandidate, scoreSocialSearchResult };

export async function collectExternalSignals(input = {}) {
  const existingPlatforms = (Array.isArray(input.existingSources) ? input.existingSources : [])
    .filter((source) => source?.source_type === "social_profile")
    .map((source) => source.platform)
    .filter(Boolean);
  const local = await collectGeoapifyLocalSignals(input);
  const social = await collectBraveSocialDiscovery({ ...input, existingPlatforms });
  return {
    sources: [...local.sources, ...social.sources],
    snapshots: [...local.snapshots, ...social.snapshots],
    items: [...local.items, ...social.items],
    errors: [...local.errors, ...social.errors],
    warnings: [...local.warnings, ...social.warnings],
    providers: { geoapify_local: local.provider, brave_social_search: social.provider },
  };
}
