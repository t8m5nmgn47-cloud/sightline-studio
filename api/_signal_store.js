// Signal Network persistence and Evidence Ledger aggregation.

import { sbInsertReturning, sbSelect, sbUpdate, sbUpsert } from "./_lib.js";
import { normDomain } from "./_audit.js";

export function signalSchemaMissing(error) {
  return /signal_(sources|snapshots|items|collection_runs|entity_links)|schema cache|does not exist|PGRST205|42P01/i.test(String(error?.message || error));
}

function asArray(value) { return Array.isArray(value) ? value : []; }
function ageDays(value, now = Date.now()) {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) && t > 0 ? Math.max(0, Math.floor((now - t) / 86_400_000)) : null;
}
function freshness(days) {
  if (days == null) return "missing";
  if (days <= 3) return "fresh";
  if (days <= 14) return "aging";
  return "stale";
}
function inc(map, key) { map[key] = (map[key] || 0) + 1; }

export async function persistSignalBundle(bundle = {}) {
  const entityKey = normDomain(bundle.entity_key || "");
  if (!entityKey) throw new Error("Signal bundle needs a valid entity_key.");
  let runId = null;
  try {
    const runRows = await sbInsertReturning("signal_collection_runs", {
      entity_key: entityKey,
      collector: "deep_public_signals_v1",
      relationship: bundle.relationship || "owned",
      started_at: bundle.collected_at || new Date().toISOString(),
      status: "running",
      metadata: { entity_name: bundle.entity_name || entityKey },
    });
    runId = runRows?.[0]?.id || null;
  } catch (error) {
    if (signalSchemaMissing(error)) return { ok: false, setup_required: true, error: "Signal Network schema is not installed." };
    throw error;
  }

  const sourceIdByKey = new Map();
  const errors = [...asArray(bundle.errors)];
  let snapshotsWritten = 0;
  let itemsWritten = 0;

  try {
    for (const source of asArray(bundle.sources)) {
      const now = bundle.collected_at || new Date().toISOString();
      const row = {
        source_key: source.source_key,
        entity_key: entityKey,
        entity_name: source.entity_name || bundle.entity_name || entityKey,
        source_type: source.source_type,
        platform: source.platform || "",
        source_url: source.source_url || "",
        external_id: source.external_id || "",
        handle: source.handle || null,
        relationship: source.relationship || bundle.relationship || "owned",
        status: source.status || "discovered",
        match_confidence: Number.isFinite(Number(source.match_confidence)) ? Number(source.match_confidence) : 1,
        metadata: source.metadata || {},
        last_seen_at: now,
        updated_at: now,
      };
      await sbUpsert("signal_sources", row, "source_key");
      const stored = await sbSelect("signal_sources", `select=id,source_key&source_key=eq.${encodeURIComponent(source.source_key)}&limit=1`);
      const id = stored?.[0]?.id;
      if (!id) { errors.push(`Source persisted but could not be reloaded: ${source.source_url || source.source_key}`); continue; }
      sourceIdByKey.set(source.source_key, id);
      await sbUpsert("signal_entity_links", {
        entity_key: entityKey,
        source_id: id,
        relationship: source.relationship || bundle.relationship || "owned",
        match_confidence: Number.isFinite(Number(source.match_confidence)) ? Number(source.match_confidence) : 1,
        match_method: source.metadata?.match_method || (source.source_type === "website" ? "domain_identity" : "website_link"),
        evidence: { source_url: source.source_url || "", discovered_on: source.metadata?.discovered_on || null },
        updated_at: now,
      }, "entity_key,source_id");
    }

    const snapshotRows = asArray(bundle.snapshots).map((row) => ({
      snapshot_key: row.snapshot_key,
      source_id: sourceIdByKey.get(row.source_key),
      entity_key: entityKey,
      signal_key: row.signal_key,
      value_numeric: row.value_numeric == null ? null : Number(row.value_numeric),
      value_text: row.value_text == null ? null : String(row.value_text),
      observed_at: row.observed_at || bundle.collected_at || new Date().toISOString(),
      dimensions: row.dimensions || {},
      provenance: row.provenance || {},
    })).filter((row) => row.source_id && row.snapshot_key && row.signal_key);
    for (const row of snapshotRows) {
      await sbUpsert("signal_snapshots", row, "snapshot_key");
      snapshotsWritten += 1;
    }

    const now = bundle.collected_at || new Date().toISOString();
    const itemRows = asArray(bundle.items).map((row) => ({
      item_key: row.item_key,
      source_id: sourceIdByKey.get(row.source_key),
      entity_key: entityKey,
      item_type: row.item_type,
      external_id: row.external_id,
      item_url: row.item_url || null,
      published_at: row.published_at || null,
      last_seen_at: now,
      title: row.title || null,
      body_text: row.body_text || null,
      media_type: row.media_type || null,
      metrics: row.metrics || {},
      classifications: row.classifications || {},
      metadata: row.metadata || {},
      content_hash: row.content_hash || null,
    })).filter((row) => row.source_id && row.item_key && row.external_id && row.item_type);
    for (const row of itemRows) {
      await sbUpsert("signal_items", row, "item_key");
      itemsWritten += 1;
    }

    const status = errors.length ? "partial" : "success";
    if (runId) await sbUpdate("signal_collection_runs", `id=eq.${encodeURIComponent(runId)}`, {
      completed_at: new Date().toISOString(),
      status,
      sources_seen: sourceIdByKey.size,
      snapshots_written: snapshotsWritten,
      items_written: itemsWritten,
      error_count: errors.length,
      errors,
      metadata: { ...(bundle.summary || {}), entity_name: bundle.entity_name || entityKey },
    });

    return {
      ok: true,
      entity_key: entityKey,
      status,
      sources_seen: sourceIdByKey.size,
      snapshots_written: snapshotsWritten,
      items_written: itemsWritten,
      errors,
    };
  } catch (error) {
    if (runId) {
      try { await sbUpdate("signal_collection_runs", `id=eq.${encodeURIComponent(runId)}`, { completed_at: new Date().toISOString(), status: "failed", error_count: errors.length + 1, errors: [...errors, String(error?.message || error)] }); } catch {}
    }
    if (signalSchemaMissing(error)) return { ok: false, setup_required: true, error: "Signal Network schema is not installed." };
    throw error;
  }
}

export function buildSignalLedger({ entityKey, sources = [], runs = [], snapshots = [], items = [] } = {}) {
  const now = Date.now();
  const sourceTypes = {};
  const platforms = {};
  const statuses = {};
  const relationships = {};
  for (const source of asArray(sources)) {
    inc(sourceTypes, source.source_type || "unknown");
    if (source.platform) inc(platforms, source.platform);
    inc(statuses, source.status || "unknown");
    inc(relationships, source.relationship || "unknown");
  }

  const itemTypes = {};
  for (const item of asArray(items)) inc(itemTypes, item.item_type || "unknown");

  const daysWithSnapshots = new Set(asArray(snapshots).map((row) => String(row.observed_at || "").slice(0, 10)).filter(Boolean));
  const websiteSnapshots = asArray(snapshots).filter((row) => /pages_collected|forms_detected|ctas_detected|technology_stack/.test(row.signal_key || ""));
  const socialSnapshots = asArray(snapshots).filter((row) => /profile_|visible_(followers|subscribers|posts|videos|views)/.test(row.signal_key || ""));
  const latestSnapshotAt = asArray(snapshots).map((row) => row.observed_at).filter(Boolean).sort().at(-1) || null;
  const latestRun = asArray(runs).slice().sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0] || null;

  const domains = [
    {
      key: "public_web",
      label: "Public web history",
      state: daysWithSnapshots.size >= 3 ? "ready" : daysWithSnapshots.size >= 1 ? "developing" : "not_ready",
      evidence: `${daysWithSnapshots.size} collection day${daysWithSnapshots.size === 1 ? "" : "s"}`,
      next: daysWithSnapshots.size >= 3 ? "Continue collection for change detection." : "Collect comparable website snapshots on additional days.",
    },
    {
      key: "social_identity",
      label: "Social identity",
      state: (sourceTypes.social_profile || 0) >= 2 ? "ready" : (sourceTypes.social_profile || 0) >= 1 ? "developing" : "not_ready",
      evidence: `${sourceTypes.social_profile || 0} discovered profile${sourceTypes.social_profile === 1 ? "" : "s"}`,
      next: (sourceTypes.social_profile || 0) ? "Keep collecting public profile snapshots and post inventory." : "Discover and verify public social profiles.",
    },
    {
      key: "social_movement",
      label: "Social movement",
      state: socialSnapshots.length >= 6 && daysWithSnapshots.size >= 2 ? "developing" : "not_ready",
      evidence: `${socialSnapshots.length} public profile measurement${socialSnapshots.length === 1 ? "" : "s"}`,
      next: "Accumulate repeated public profile measurements and post-level history.",
    },
    {
      key: "content_inventory",
      label: "Content inventory",
      state: (itemTypes.web_page || 0) >= 5 ? "ready" : (itemTypes.web_page || 0) >= 1 ? "developing" : "not_ready",
      evidence: `${itemTypes.web_page || 0} web page${itemTypes.web_page === 1 ? "" : "s"} indexed`,
      next: "Expand crawl coverage and compare page fingerprints over time.",
    },
  ];

  return {
    entity_key: entityKey,
    generated_at: new Date().toISOString(),
    summary: {
      source_count: asArray(sources).length,
      snapshot_count: asArray(snapshots).length,
      item_count: asArray(items).length,
      collection_run_count: asArray(runs).length,
      collection_days: daysWithSnapshots.size,
      latest_snapshot_at: latestSnapshotAt,
      latest_snapshot_age_days: ageDays(latestSnapshotAt, now),
      freshness: freshness(ageDays(latestSnapshotAt, now)),
      website_measurements: websiteSnapshots.length,
      social_measurements: socialSnapshots.length,
    },
    coverage: { source_types: sourceTypes, platforms, statuses, relationships, item_types: itemTypes },
    domains,
    latest_run: latestRun,
    sources: asArray(sources).slice().sort((a, b) => new Date(b.last_seen_at || 0) - new Date(a.last_seen_at || 0)),
    recent_snapshots: asArray(snapshots).slice().sort((a, b) => new Date(b.observed_at || 0) - new Date(a.observed_at || 0)).slice(0, 60),
    recent_items: asArray(items).slice().sort((a, b) => new Date(b.last_seen_at || b.published_at || 0) - new Date(a.last_seen_at || a.published_at || 0)).slice(0, 60),
  };
}

export async function readSignalLedger(entityKeyInput) {
  const entityKey = normDomain(entityKeyInput || "");
  if (!entityKey) throw new Error("Enter a valid business domain.");
  try {
    const [sources, runs, snapshots, items] = await Promise.all([
      sbSelect("signal_sources", `select=*&entity_key=eq.${encodeURIComponent(entityKey)}&order=last_seen_at.desc&limit=200`),
      sbSelect("signal_collection_runs", `select=*&entity_key=eq.${encodeURIComponent(entityKey)}&order=started_at.desc&limit=50`),
      sbSelect("signal_snapshots", `select=*&entity_key=eq.${encodeURIComponent(entityKey)}&order=observed_at.desc&limit=1000`),
      sbSelect("signal_items", `select=*&entity_key=eq.${encodeURIComponent(entityKey)}&order=last_seen_at.desc&limit=1000`),
    ]);
    return { ok: true, setup_required: false, ledger: buildSignalLedger({ entityKey, sources, runs, snapshots, items }) };
  } catch (error) {
    if (signalSchemaMissing(error)) return { ok: false, setup_required: true, error: "Signal Network schema is not installed." };
    throw error;
  }
}
