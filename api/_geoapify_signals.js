// Geoapify local-presence collector. Uses supported Geocoding and Place Details
// APIs only; it does not scrape Google or claim review/rating data Geoapify does
// not provide.

import { normDomain } from "./_audit.js";
import { sourceKey, stableHash } from "./_signals.js";

const TIMEOUT_MS = 10_000;
const MAX_DETAIL_LOOKUPS = 2;
const NAME_STOPWORDS = new Set(["and", "the", "of", "a", "an", "llc", "inc", "ltd", "company", "co", "pllc", "pc"]);

function bounded(value, max = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function tokenSet(value) {
  return new Set(String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !NAME_STOPWORDS.has(token)));
}

function overlapScore(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(1, Math.min(left.size, right.size));
}

function domainFromUrl(value) {
  try { return normDomain(new URL(value).hostname).replace(/^www\./, ""); }
  catch { return ""; }
}

function sameDomain(url, domain) {
  const left = domainFromUrl(url);
  const right = normDomain(domain).replace(/^www\./, "");
  return !!left && left === right;
}

async function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) {
      const message = data?.error?.message || data?.message || text || `HTTP ${response.status}`;
      throw new Error(`${response.status}: ${bounded(message, 500)}`);
    }
    return data || {};
  } finally {
    clearTimeout(timer);
  }
}

function sourceWithKey(source) {
  return { ...source, source_key: sourceKey(source) };
}

function snapshot(source, signalKey, observedAt, value, dimensions = {}, provenance = {}) {
  const numeric = typeof value === "number" && Number.isFinite(value);
  const valueNumeric = numeric ? value : null;
  const valueText = numeric || value == null ? null : bounded(value, 12_000);
  const day = String(observedAt).slice(0, 10);
  return {
    snapshot_key: stableHash([source.source_key, signalKey, valueNumeric ?? "", valueText ?? "", day].join("|")),
    source_key: source.source_key,
    entity_key: source.entity_key,
    signal_key: signalKey,
    value_numeric: valueNumeric,
    value_text: valueText,
    observed_at: observedAt,
    dimensions,
    provenance,
  };
}

function detailProperties(data = {}) {
  const feature = (Array.isArray(data?.features) ? data.features : [])
    .find((row) => row?.properties?.feature_type === "details")
    || (Array.isArray(data?.features) ? data.features[0] : null);
  return feature?.properties || {};
}

function candidateName(candidate = {}, details = {}) {
  return details.name || candidate.name || candidate.address_line1 || "";
}

export function scoreGeoapifyCandidate(candidate = {}, details = {}, { domain = "", name = "" } = {}) {
  const displayName = candidateName(candidate, details);
  const website = details.website || details?.brand_details?.website || details?.operator_details?.website || "";
  const normalizedName = bounded(name).toLowerCase();
  let score = 0;
  if (website && sameDomain(website, domain)) score += 0.72;
  score += Math.min(0.22, overlapScore(displayName, name) * 0.22);
  if (normalizedName && bounded(displayName).toLowerCase() === normalizedName) score += 0.08;
  const rankConfidence = Number(candidate?.rank?.confidence);
  if (Number.isFinite(rankConfidence)) score += Math.min(0.12, Math.max(0, rankConfidence) * 0.12);
  if (candidate.result_type === "amenity" || candidate.category || Array.isArray(details.categories)) score += 0.04;
  return Math.min(1, Number(score.toFixed(3)));
}

function osmUrl(candidate = {}) {
  const lat = Number(candidate.lat);
  const lon = Number(candidate.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=18/${lat}/${lon}`;
}

export async function collectGeoapifyLocalSignals({
  entityKey,
  entityName,
  relationship = "owned",
  observedAt = new Date().toISOString(),
} = {}) {
  const apiKey = process.env.GEOAPIFY_API_KEY || "";
  const domain = normDomain(entityKey || "").replace(/^www\./, "");
  const name = bounded(entityName || domain, 300);
  if (!apiKey) {
    return {
      sources: [], snapshots: [], items: [], errors: [], warnings: [],
      provider: { key: "geoapify_local", status: "unconfigured" },
    };
  }

  try {
    const endpoint = new URL("https://api.geoapify.com/v1/geocode/search");
    endpoint.searchParams.set("name", name);
    endpoint.searchParams.set("type", "amenity");
    endpoint.searchParams.set("limit", "8");
    endpoint.searchParams.set("lang", "en");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("bias", "countrycode:none");
    endpoint.searchParams.set("apiKey", apiKey);
    const search = await fetchJson(endpoint.toString());
    const candidates = (Array.isArray(search?.results) ? search.results : [])
      .filter((row) => row?.place_id)
      .map((candidate) => ({
        candidate,
        initial_score: scoreGeoapifyCandidate(candidate, {}, { domain, name }),
      }))
      .sort((a, b) => b.initial_score - a.initial_score)
      .slice(0, MAX_DETAIL_LOOKUPS);

    const ranked = [];
    for (const entry of candidates) {
      const detailsUrl = new URL("https://api.geoapify.com/v2/place-details");
      detailsUrl.searchParams.set("id", entry.candidate.place_id);
      detailsUrl.searchParams.set("features", "details");
      detailsUrl.searchParams.set("lang", "en");
      detailsUrl.searchParams.set("apiKey", apiKey);
      const details = detailProperties(await fetchJson(detailsUrl.toString()));
      const score = scoreGeoapifyCandidate(entry.candidate, details, { domain, name });
      ranked.push({ ...entry, details, score });
      if (sameDomain(details.website || "", domain) && score >= 0.82) break;
    }
    ranked.sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.68) {
      return {
        sources: [], snapshots: [], items: [], errors: [],
        warnings: [`Geoapify returned no sufficiently confident local match for ${domain}.`],
        provider: {
          key: "geoapify_local",
          status: "no_match",
          candidates: ranked.length,
          best_confidence: best?.score || 0,
          requests_used: 1 + ranked.length,
        },
      };
    }

    const candidate = best.candidate;
    const details = best.details || {};
    const website = details.website || details?.brand_details?.website || details?.operator_details?.website || null;
    const categories = Array.isArray(details.categories)
      ? details.categories
      : candidate.category ? [candidate.category] : [];
    const source = sourceWithKey({
      entity_key: domain,
      entity_name: name,
      source_type: "local_profile",
      platform: "geoapify",
      source_url: osmUrl(candidate),
      external_id: candidate.place_id,
      handle: null,
      relationship,
      status: "active",
      match_confidence: best.score,
      metadata: {
        provider: "geoapify_geocoding_place_details",
        attribution: candidate?.datasource?.attribution || "© OpenStreetMap contributors",
        match_method: website && sameDomain(website, domain) ? "website_domain" : "business_name",
        display_name: candidateName(candidate, details),
        website_uri: website,
        formatted_address: candidate.formatted || null,
        categories,
        result_type: candidate.result_type || null,
        latitude: Number.isFinite(Number(candidate.lat)) ? Number(candidate.lat) : null,
        longitude: Number.isFinite(Number(candidate.lon)) ? Number(candidate.lon) : null,
        caveat: "OpenStreetMap-derived local identity; may be incomplete or outdated and does not include Google ratings or reviews",
      },
    });
    const provenance = {
      provider: "geoapify_geocoding_place_details",
      place_id: candidate.place_id,
      attribution: candidate?.datasource?.attribution || "© OpenStreetMap contributors",
      caveat: "local identity signal; not review data or first-party conversion data",
    };
    const snapshots = [snapshot(source, "local_place_present", observedAt, 1, {}, provenance)];
    const displayName = candidateName(candidate, details);
    if (displayName) snapshots.push(snapshot(source, "local_display_name", observedAt, displayName, {}, provenance));
    if (candidate.formatted) snapshots.push(snapshot(source, "local_formatted_address", observedAt, candidate.formatted, {}, provenance));
    if (categories.length) snapshots.push(snapshot(source, "local_primary_category", observedAt, categories[0], {}, provenance));
    if (website) snapshots.push(snapshot(source, "local_website_domain_match", observedAt, sameDomain(website, domain) ? 1 : 0, {}, provenance));
    if (Number.isFinite(Number(candidate.lat))) snapshots.push(snapshot(source, "local_latitude", observedAt, Number(candidate.lat), {}, provenance));
    if (Number.isFinite(Number(candidate.lon))) snapshots.push(snapshot(source, "local_longitude", observedAt, Number(candidate.lon), {}, provenance));

    return {
      sources: [source], snapshots, items: [], errors: [], warnings: [],
      provider: {
        key: "geoapify_local",
        status: "active",
        match_confidence: best.score,
        place_id: candidate.place_id,
        requests_used: 1 + ranked.length,
        review_data_available: false,
      },
    };
  } catch (error) {
    return {
      sources: [], snapshots: [], items: [], warnings: [],
      errors: [`Geoapify local search: ${bounded(error?.message || error, 500)}`],
      provider: { key: "geoapify_local", status: "error" },
    };
  }
}
