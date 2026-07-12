// Deterministic interpretation of Signal Network evidence for the Opportunity Feed.
// Baselines remain baselines. Change claims require comparable owned snapshots on
// at least two different days. Peer evidence is never used for owned findings.

const asArray = (value) => Array.isArray(value) ? value : [];

function iso(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function latestIso(values = []) {
  return values.map(iso).filter(Boolean).sort().at(-1) || null;
}

function day(value) {
  return String(value || "").slice(0, 10);
}

function dayCount(rows = []) {
  return new Set(rows.map((row) => day(row?.observed_at)).filter(Boolean)).size;
}

function valueOf(row) {
  if (row?.value_numeric != null && Number.isFinite(Number(row.value_numeric))) return Number(row.value_numeric);
  return row?.value_text == null ? null : String(row.value_text);
}

function sameValue(left, right) {
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) < 1e-9;
  return String(left ?? "") === String(right ?? "");
}

function compact(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function dailySeries(rows = []) {
  const byDay = new Map();
  for (const row of rows.slice().sort((a, b) => Date.parse(a?.observed_at || 0) - Date.parse(b?.observed_at || 0))) {
    const key = day(row?.observed_at);
    if (key) byDay.set(key, row);
  }
  return [...byDay.values()].sort((a, b) => Date.parse(a?.observed_at || 0) - Date.parse(b?.observed_at || 0));
}

function localChange(localSource, localSnapshots = []) {
  const labels = {
    local_display_name: "display name",
    local_formatted_address: "address",
    local_primary_category: "primary category",
    local_website_domain_match: "website match",
  };
  const changes = [];
  for (const [signalKey, label] of Object.entries(labels)) {
    const series = dailySeries(localSnapshots.filter((row) => row.signal_key === signalKey));
    if (series.length < 2) continue;
    const previous = series.at(-2);
    const current = series.at(-1);
    const before = valueOf(previous);
    const after = valueOf(current);
    if (sameValue(before, after)) continue;
    changes.push({ signal_key: signalKey, label, before, after, previous, current });
  }
  if (!changes.length) return null;

  const websiteMismatch = changes.find((change) => change.signal_key === "local_website_domain_match" && Number(change.after) === 0);
  const periodStart = latestIso(changes.map((change) => change.previous?.observed_at));
  const periodEnd = latestIso(changes.map((change) => change.current?.observed_at));
  const comparison = changes.map((change) => `${change.label}: ${compact(change.before ?? "—", 70)} → ${compact(change.after ?? "—", 70)}`).join(" · ");

  return {
    type: websiteMismatch ? "fix" : "watch",
    headline: websiteMismatch
      ? "The local profile no longer points to the tracked website"
      : `Local ${changes.map((change) => change.label).join(" and ")} changed`,
    body: `Sightline observed a different local identity value on a later collection day. ${comparison}`,
    recommendation: "Verify the current business name, address, category, and website against the official business record before publishing or acting on the changed listing data.",
    confidence: Number(localSource?.match_confidence || 0) >= 0.82 ? "high" : "medium",
    evidence: {
      sample_size: 2,
      period_start: periodStart,
      period_end: periodEnd,
      comparison,
      source: "signal_local_change",
      caveat: "This is a public local-identity change, not evidence of improved rankings, reviews, leads, or revenue.",
    },
  };
}

function blockedWebsiteCard(blockedWebsite, hasExternalEvidence) {
  const observedAt = iso(blockedWebsite?.last_seen_at || blockedWebsite?.first_seen_at);
  return {
    type: hasExternalEvidence ? "watch" : "fix",
    headline: hasExternalEvidence
      ? "Website change history is unavailable to Sightline"
      : "Website evidence is blocked and no external baseline is active",
    body: "The owned website disallows automated collection at its root. Sightline recorded the access state and did not crawl the site.",
    recommendation: hasExternalEvidence
      ? "Continue external evidence collection. If website change detection matters, explicitly permit Sightline or connect a first-party website export."
      : "Activate an external evidence source now. If website change detection matters, explicitly permit Sightline or connect a first-party website export.",
    confidence: "high",
    evidence: {
      sample_size: 1,
      period_start: observedAt,
      period_end: observedAt,
      comparison: "robots.txt access: blocked",
      source: "signal_access_state",
      caveat: "This is an access finding only, not a judgment about website quality or performance.",
    },
  };
}

function socialCandidateCard(candidates) {
  const platforms = unique(candidates.map((source) => source.platform)).map((value) => compact(value, 40));
  const observedAt = latestIso(candidates.map((source) => source.last_seen_at || source.first_seen_at));
  return {
    type: "fix",
    headline: `Verify ${candidates.length} discovered social profile candidate${candidates.length === 1 ? "" : "s"}`,
    body: `Independent public search found candidate account${candidates.length === 1 ? "" : "s"} on ${platforms.join(", ") || "social platforms"}. Sightline is not treating them as official accounts yet.`,
    recommendation: "Review the candidate URLs in the Evidence Ledger and confirm which accounts are officially controlled by the business before using them in recommendations or reporting.",
    confidence: candidates.every((source) => Number(source.match_confidence || 0) >= 0.8) ? "high" : "medium",
    evidence: {
      sample_size: candidates.length,
      period_start: observedAt,
      period_end: observedAt,
      comparison: platforms.join(", ") || "independent social discovery",
      source: "signal_social_identity",
      caveat: "Search-discovered profiles are identity candidates, not verified ownership or performance evidence.",
    },
  };
}

function localBaselineCard(localSource, localSnapshots) {
  const observedAt = latestIso(localSnapshots.map((row) => row.observed_at)) || iso(localSource?.last_seen_at || localSource?.first_seen_at);
  const latest = new Map();
  for (const row of localSnapshots.slice().sort((a, b) => Date.parse(a?.observed_at || 0) - Date.parse(b?.observed_at || 0))) {
    latest.set(row.signal_key, valueOf(row));
  }
  const name = compact(latest.get("local_display_name") || localSource?.metadata?.display_name || "Matched local profile", 100);
  const address = compact(latest.get("local_formatted_address") || localSource?.metadata?.formatted_address || "", 130);
  const category = compact(latest.get("local_primary_category") || localSource?.metadata?.categories?.[0] || "", 80);
  const details = [name, address, category].filter(Boolean).join(" · ");
  const confidence = Number(localSource?.match_confidence || 0);

  if (confidence < 0.8) {
    return {
      type: "fix",
      headline: "Verify the local business match before relying on it",
      body: `Geoapify found a plausible public local profile, but the identity confidence is ${Math.round(confidence * 100)}%. ${details}`,
      recommendation: "Compare the matched name, address, category, and website with the official business record before treating this source as confirmed.",
      confidence: "medium",
      evidence: {
        sample_size: 1,
        period_start: observedAt,
        period_end: observedAt,
        comparison: `match confidence ${Math.round(confidence * 100)}%`,
        source: "signal_local_identity",
        caveat: "OpenStreetMap-derived identity may be incomplete or outdated and does not include Google ratings or reviews.",
      },
    };
  }

  return {
    type: "watch",
    headline: "Local business identity baseline established",
    body: details || "Sightline matched a public local identity record for the owned business.",
    recommendation: "Run a later comparable collection before treating any difference in name, address, category, or website as a change.",
    confidence: confidence >= 0.82 ? "high" : "medium",
    evidence: {
      sample_size: 1,
      period_start: observedAt,
      period_end: observedAt,
      comparison: `match confidence ${Math.round(confidence * 100)}%`,
      source: "signal_local_identity",
      caveat: "This is a one-day identity baseline, not a trend, ranking, review, lead, or revenue claim.",
    },
  };
}

function localNoMatchCard(provider) {
  const candidates = Number(provider?.candidates || 0);
  return {
    type: "fix",
    headline: "No confident local business match was found",
    body: `Geoapify completed a bounded lookup but did not find a candidate strong enough to attach to the business.${candidates ? ` ${candidates} candidate${candidates === 1 ? " was" : "s were"} evaluated.` : ""}`,
    recommendation: "Confirm the official business name and location, then collect again. A missing public local record may also need to be added or corrected at its underlying directory source.",
    confidence: "medium",
    evidence: {
      sample_size: candidates,
      comparison: provider?.best_confidence != null ? `best match ${Math.round(Number(provider.best_confidence) * 100)}%` : "no confident match",
      source: "signal_local_identity",
      caveat: "A provider no-match is an evidence gap, not proof that the business has no local listing.",
    },
  };
}

export function buildSignalInterpretation(ledger = {}, options = {}) {
  const sources = asArray(ledger?.sources);
  const snapshots = asArray(ledger?.recent_snapshots);
  const ownedSources = sources.filter((source) => (source.relationship || "owned") === "owned");
  const ownedIds = new Set(ownedSources.map((source) => source.id).filter(Boolean));
  const ownedSnapshots = snapshots.filter((row) => row?.source_id && ownedIds.has(row.source_id));

  const websiteSources = ownedSources.filter((source) => source.source_type === "website");
  const blockedWebsite = websiteSources.find((source) => source.status === "blocked" && source?.metadata?.robots_blocked === true);
  const localSources = ownedSources.filter((source) => source.source_type === "local_profile" || source.source_type === "review_profile");
  const socialSources = ownedSources.filter((source) => source.source_type === "social_profile");
  const searchSources = ownedSources.filter((source) => source.source_type === "search_query");
  const socialCandidates = socialSources.filter((source) => source.status === "discovered" && Number(source.match_confidence || 0) >= 0.68);
  const verifiedSocial = socialSources.filter((source) => source.status === "active" && Number(source.match_confidence || 0) >= 0.8);
  const localSource = localSources.slice().sort((a, b) => {
    const recency = Date.parse(b.last_seen_at || b.first_seen_at || 0) - Date.parse(a.last_seen_at || a.first_seen_at || 0);
    return recency || Number(b.match_confidence || 0) - Number(a.match_confidence || 0);
  })[0] || null;
  const localIds = new Set(localSources.map((source) => source.id).filter(Boolean));
  const localSnapshots = ownedSnapshots.filter((row) => localIds.has(row.source_id) && String(row.signal_key || "").startsWith("local_"));
  const currentLocalSnapshots = localSource ? localSnapshots.filter((row) => row.source_id === localSource.id) : [];
  const localDays = dayCount(localSnapshots);
  const currentLocalDays = dayCount(currentLocalSnapshots);
  const ownedDays = dayCount(ownedSnapshots);
  const cards = [];
  let changeCount = 0;

  if (localSource && currentLocalDays >= 2) {
    const change = localChange(localSource, currentLocalSnapshots);
    if (change) {
      cards.push(change);
      changeCount += 1;
    }
  }

  if (socialCandidates.length) cards.push(socialCandidateCard(socialCandidates));

  const providers = ledger?.latest_run?.metadata?.external_providers || {};
  const geoapify = providers.geoapify_local || null;
  if (!localSource && geoapify?.status === "no_match") cards.push(localNoMatchCard(geoapify));
  else if (localSource && currentLocalDays <= 1) cards.push(localBaselineCard(localSource, currentLocalSnapshots));

  const hasExternalEvidence = localSources.length > 0 || socialSources.length > 0 || searchSources.length > 0 || ownedSnapshots.some((row) => /^(local_|search_|social_)/.test(row.signal_key || ""));
  if (blockedWebsite) cards.push(blockedWebsiteCard(blockedWebsite, hasExternalEvidence));

  const generatedAt = iso(options.generatedAt) || new Date().toISOString();
  const state = changeCount > 0 ? "change_detected" : ownedSnapshots.length || ownedSources.length ? "baseline" : "empty";
  return {
    generated_at: generatedAt,
    state,
    cards: cards.slice(0, 4),
    summary: {
      owned_source_count: ownedSources.length,
      owned_snapshot_count: ownedSnapshots.length,
      owned_observation_days: ownedDays,
      blocked_website: !!blockedWebsite,
      local_profile_count: localSources.length,
      local_observation_days: localDays,
      current_local_observation_days: currentLocalDays,
      social_candidate_count: socialCandidates.length,
      verified_social_count: verifiedSocial.length,
      independent_search_source_count: searchSources.length,
      changes_detected: changeCount,
    },
  };
}
