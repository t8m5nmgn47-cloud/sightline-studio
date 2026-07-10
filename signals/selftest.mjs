import assert from "node:assert/strict";
import {
  analyzePublicPage,
  normalizePublicUrl,
  parseVisibleCounts,
  platformFromUrl,
  sourceKey,
  stableHash,
} from "../api/_signals.js";
import { buildSignalLedger } from "../api/_signal_store.js";
import { selectSignalRefreshTargets } from "../api/signal-refresh.js";

// Deterministic hashing and source identity.
assert.equal(stableHash("same"), stableHash("same"));
assert.notEqual(stableHash("same"), stableHash("different"));
assert.notEqual(
  sourceKey({ entity_key: "example.com", source_type: "website", platform: "web", source_url: "https://example.com/" }),
  sourceKey({ entity_key: "peer.com", source_type: "website", platform: "web", source_url: "https://peer.com/" }),
);

// Public URL normalization removes fragments and common attribution noise.
assert.equal(
  normalizePublicUrl("/services?utm_source=google&utm_campaign=spring#pricing", "https://Example.com/home"),
  "https://example.com/services",
);
assert.equal(normalizePublicUrl("mailto:hello@example.com", "https://example.com"), "");

// Social platform discovery and public-count parsing.
assert.equal(platformFromUrl("https://www.instagram.com/example/"), "instagram");
assert.equal(platformFromUrl("https://youtube.com/@example"), "youtube");
assert.equal(platformFromUrl("https://example.com/about"), "");
assert.deepEqual(parseVisibleCounts("12.4K followers · 320 posts · 1.2M views"), {
  followers: 12400,
  posts: 320,
  views: 1200000,
});

// Website page analysis extracts useful evidence without inventing outcomes.
const html = `<!doctype html><html><head>
<title>Example Advisory</title>
<meta name="description" content="Tax and advisory help for growing companies">
<link rel="canonical" href="https://example.com/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"AccountingService"}</script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
</head><body><h1>Clarity for the next decision.</h1>
<a href="/contact">Schedule a consultation</a><a href="https://instagram.com/example">Instagram</a>
<form action="/lead"><input name="email"></form></body></html>`;
const page = analyzePublicPage(html, "https://example.com/");
assert.equal(page.title, "Example Advisory");
assert.equal(page.description, "Tax and advisory help for growing companies");
assert.deepEqual(page.h1, ["Clarity for the next decision."]);
assert.equal(page.form_count, 1);
assert.ok(page.ctas.includes("Schedule a consultation"));
assert.equal(page.socials[0].platform, "instagram");
assert.ok(page.schema_types.includes("AccountingService"));
assert.ok(page.technologies.includes("google_tag_manager"));
assert.ok(page.content_hash.length === 64);

// Ledger readiness uses owned evidence for owned maturity and keeps peers separate.
const sources = [
  { id: "s1", source_type: "website", platform: "web", relationship: "owned", status: "active", last_seen_at: "2026-07-10T10:00:00Z" },
  { id: "s2", source_type: "social_profile", platform: "instagram", relationship: "owned", status: "active", last_seen_at: "2026-07-10T10:00:00Z" },
  { id: "s3", source_type: "social_profile", platform: "youtube", relationship: "owned", status: "active", last_seen_at: "2026-07-10T10:00:00Z" },
  { id: "p1", source_type: "website", platform: "web", relationship: "peer", status: "active", last_seen_at: "2026-07-10T10:00:00Z" },
  { id: "p2", source_type: "website", platform: "web", relationship: "peer", status: "active", last_seen_at: "2026-07-10T10:00:00Z" },
  { id: "p3", source_type: "website", platform: "web", relationship: "peer", status: "active", last_seen_at: "2026-07-10T10:00:00Z" },
];
const snapshots = [
  { source_id: "s1", signal_key: "pages_collected", value_numeric: 8, observed_at: "2026-07-08T10:00:00Z" },
  { source_id: "s1", signal_key: "pages_collected", value_numeric: 8, observed_at: "2026-07-09T10:00:00Z" },
  { source_id: "s1", signal_key: "pages_collected", value_numeric: 9, observed_at: "2026-07-10T10:00:00Z" },
  { source_id: "s2", signal_key: "visible_followers", value_numeric: 100, observed_at: "2026-07-10T10:00:00Z" },
  { source_id: "p1", signal_key: "pages_collected", value_numeric: 40, observed_at: "2026-07-01T10:00:00Z" },
];
const items = Array.from({ length: 6 }, (_, i) => ({ source_id: "s1", item_type: "web_page", entity_key: "example.com", external_id: `page-${i}`, last_seen_at: "2026-07-10T10:00:00Z" }));
const ledger = buildSignalLedger({ entityKey: "example.com", sources, snapshots, items, runs: [] });
assert.equal(ledger.summary.owned_source_count, 3);
assert.equal(ledger.summary.peer_source_count, 3);
assert.equal(ledger.summary.collection_days, 3, "peer snapshot days must not inflate owned history");
assert.equal(ledger.domains.find((d) => d.key === "public_web").state, "ready");
assert.equal(ledger.domains.find((d) => d.key === "social_identity").state, "ready");
assert.equal(ledger.domains.find((d) => d.key === "peer_context").state, "developing");

// Scheduled selection canonicalizes www aliases and chooses the stalest anchors first.
const targets = selectSignalRefreshTargets([
  { domain: "www.alpha.com" },
  { domain: "beta.com" },
  { domain: "gamma.com" },
], [
  { anchor_entity_key: "alpha.com", started_at: "2026-07-10T00:00:00Z" },
  { anchor_entity_key: "beta.com", started_at: "2026-07-01T00:00:00Z" },
], 2);
assert.deepEqual(targets.map((row) => row.domain), ["gamma.com", "beta.com"]);

console.log("Signal Network self-test passed: identity, public URL normalization, social discovery, count parsing, page analysis, owned/peer separation, and stale refresh rotation.");
