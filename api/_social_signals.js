// Structured social collectors. V1 supports YouTube Data API v3 when an API key
// is configured. Other platforms remain source/profile discovery until an
// authorized or compliant structured collector is available.

import { stableHash } from "./_signals.js";

const TIMEOUT_MS = 10_000;
const UA = "Mozilla/5.0 (compatible; SightlineSignal/1.0; +https://sightline-studio.vercel.app/)";

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function classifyPublicContent(text = "") {
  const value = String(text || "").toLowerCase();
  const purpose = /book|schedule|call today|limited time|save \$|% off|discount|offer|sale/.test(value) ? "promotional"
    : /how to|tips?|guide|explains?|what is|why |learn|mistakes?|questions?/.test(value) ? "educational"
    : /review|testimonial|client story|customer story/.test(value) ? "testimonial"
    : /hiring|join our team|career|apply now/.test(value) ? "hiring"
    : /community|sponsor|donat|volunteer|event/.test(value) ? "community"
    : "other";
  const cta = /book|schedule|appointment/.test(value) ? "book"
    : /call|phone/.test(value) ? "call"
    : /visit|learn more|read more|website/.test(value) ? "visit"
    : /comment|tell us|reply/.test(value) ? "comment"
    : /message|dm us|send us/.test(value) ? "message"
    : "none";
  return { purpose, cta };
}

async function youtubeJson(path, params, key) {
  const query = new URLSearchParams({ ...params, key });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`YouTube API ${response.status}`);
    return response.json();
  } finally { clearTimeout(timer); }
}

function channelFilter(source) {
  try {
    const url = new URL(source.source_url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (source.external_id && /^UC[\w-]+$/.test(source.external_id)) return { id: source.external_id };
    if (parts[0]?.startsWith("@")) return { forHandle: parts[0].slice(1) };
    if (parts[0] === "channel" && parts[1]) return { id: parts[1] };
    return null;
  } catch { return null; }
}

function snapshot(source, signalKey, value, observedAt, provenance = {}) {
  const numeric = typeof value === "number" && Number.isFinite(value);
  const valueNumeric = numeric ? value : null;
  const valueText = numeric || value == null ? null : String(value);
  const day = String(observedAt).slice(0, 10);
  return {
    snapshot_key: stableHash([source.source_key, signalKey, valueNumeric ?? "", valueText ?? "", day].join("|")),
    source_key: source.source_key,
    entity_key: source.entity_key,
    signal_key: signalKey,
    value_numeric: valueNumeric,
    value_text: valueText,
    observed_at: observedAt,
    dimensions: {},
    provenance: { method: "youtube_data_api_v3", ...provenance },
  };
}

export async function collectYouTubeSignals(source, observedAt = new Date().toISOString(), apiKey = process.env.YOUTUBE_API_KEY) {
  if (!apiKey || source?.platform !== "youtube") return { snapshots: [], items: [], errors: [], skipped: !apiKey ? "YOUTUBE_API_KEY not configured" : "not youtube" };
  const filter = channelFilter(source);
  if (!filter) return { snapshots: [], items: [], errors: ["Could not resolve YouTube channel identity."], skipped: false };

  try {
    const channelData = await youtubeJson("channels", { part: "snippet,statistics,contentDetails", ...filter }, apiKey);
    const channel = channelData?.items?.[0];
    if (!channel) return { snapshots: [], items: [], errors: ["YouTube channel was not found."], skipped: false };
    const stats = channel.statistics || {};
    const snapshots = [
      snapshot(source, "profile_title", channel.snippet?.title || "", observedAt),
      snapshot(source, "visible_subscribers", numberOrNull(stats.subscriberCount), observedAt),
      snapshot(source, "visible_videos", numberOrNull(stats.videoCount), observedAt),
      snapshot(source, "visible_views", numberOrNull(stats.viewCount), observedAt),
    ].filter((row) => row.value_text || row.value_numeric != null);

    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) return { snapshots, items: [], errors: [], channel_id: channel.id };
    const playlist = await youtubeJson("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "25" }, apiKey);
    const videoIds = (playlist?.items || []).map((item) => item.contentDetails?.videoId).filter(Boolean);
    if (!videoIds.length) return { snapshots, items: [], errors: [], channel_id: channel.id };
    const videos = await youtubeJson("videos", { part: "snippet,statistics", id: videoIds.join(",") }, apiKey);
    const items = (videos?.items || []).map((video) => {
      const snippet = video.snippet || {};
      const metrics = video.statistics || {};
      const text = `${snippet.title || ""} ${snippet.description || ""}`;
      return {
        item_key: stableHash(`${source.source_key}|video|${video.id}`),
        source_key: source.source_key,
        entity_key: source.entity_key,
        item_type: "video",
        external_id: video.id,
        item_url: `https://www.youtube.com/watch?v=${video.id}`,
        published_at: snippet.publishedAt || null,
        title: snippet.title || null,
        body_text: String(snippet.description || "").slice(0, 12_000) || null,
        media_type: "video",
        metrics: {
          views: numberOrNull(metrics.viewCount),
          likes: numberOrNull(metrics.likeCount),
          comments: numberOrNull(metrics.commentCount),
        },
        classifications: classifyPublicContent(text),
        metadata: { channel_id: channel.id, channel_title: channel.snippet?.title || null },
        content_hash: stableHash(text),
      };
    });
    return { snapshots, items, errors: [], channel_id: channel.id };
  } catch (error) {
    return { snapshots: [], items: [], errors: [String(error?.message || error)], skipped: false };
  }
}
