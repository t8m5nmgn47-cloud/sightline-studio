# Deep Signal Acquisition v1

## Purpose

Deep Signal Acquisition creates a raw evidence layer beneath Sightline BI. It preserves where a signal came from, which entity it belongs to, whether it is owned or peer evidence, when it was observed, and whether it is fresh enough to support a claim.

## What v1 collects

### Website evidence

- bounded sitemap-aware page inventory
- title, description, H1, word count
- forms and conversion-oriented CTA labels
- schema.org types
- selected technology fingerprints
- page content fingerprints for future change detection
- social profile links discovered from collected pages

The website collector validates public hosts and redirects, uses a bounded page count and timeout, and honors root/path disallows found in robots.txt.

### Social evidence

For discovered public profiles:

- platform
- public profile URL
- public handle when derivable
- profile title and description when the page is publicly fetchable
- visible count-like metadata when present in public metadata
- source status: discovered, active, blocked, or error

When `YOUTUBE_API_KEY` is configured, YouTube collection additionally records:

- channel title
- subscriber count when publicly available
- channel video count
- channel view count
- up to 25 recent videos
- public video views, likes, and comment counts
- deterministic first-pass content purpose and CTA classification

No collector bypasses login walls, CAPTCHAs, private profiles, or access controls.

## Data model

Run `sql/sightline_signal_network_v1.sql` against the Sightline Supabase project.

Tables:

- `signal_sources` — discovered or connected evidence sources
- `signal_collection_runs` — collection health and errors
- `signal_snapshots` — immutable point-in-time measurements
- `signal_items` — pages, videos, and future posts/reviews/articles/ads/jobs
- `signal_entity_links` — owned, peer, and market relationships relative to an anchor business

RLS is enabled and no public policies are created. Server-side service-role access is required.

## Operator surfaces

- `/intelligence/evidence/` — Evidence Ledger
- `GET /api/signal-ledger?domain=example.com`
- `POST /api/signal-collect` with `{ "domain": "example.com", "include_peers": true }`

The manual collector is protected by the existing admin Basic Auth middleware.

## Scheduled cadence

`/api/signal-refresh` runs at 11:00 UTC after the existing audit and intelligence refresh jobs. It is protected by `CRON_SECRET` and rotates through the stalest anchor businesses.

If the Signal Network schema is not installed, the cron returns a clean skipped response. After the schema exists, collection begins without another code change.

The scheduled collector currently uses a bounded batch:

- 2 anchor businesses per run
- up to 6 owned pages per anchor
- up to 2 quality-approved peers
- up to 3 pages per peer

## Quality and trust rules

- owned and peer evidence are linked separately
- peer collection uses the existing peer-quality assessment
- peer snapshots never increase owned evidence maturity
- one snapshot is a baseline, not a trend
- repeated collection days are required for change history
- raw signals are not automatically converted into business-outcome claims
- post-level metrics are public engagement evidence, not revenue attribution

## Validation

Run:

```bash
npm run signal:check
```

The deterministic suite covers source identity, URL normalization, social discovery, visible-count parsing, content classification, page analysis, owned-versus-peer separation, and stale refresh rotation.
