// Low-cost external signal stack: Geoapify local identity plus Brave social
// discovery. Google Places remains available in the legacy module but is not
// invoked by this stack.

import { collectBraveSocialDiscovery } from "./_external_signals.js";
import { collectGeoapifyLocalSignals } from "./_geoapify_signals.js";

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
