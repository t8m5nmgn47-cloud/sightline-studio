# External Signal Acquisition v1

External Signal Acquisition extends the Signal Network beyond the business website. It is designed for businesses whose website blocks crawling, is unavailable, or does not link every official profile.

## Supported providers

### Google Places API (New)

Environment variable:

```text
GOOGLE_PLACES_API_KEY
```

The collector uses Text Search (New) with a bounded field mask. A candidate must pass a deterministic identity threshold based primarily on exact website-domain matching and secondarily on business-name similarity.

Captured evidence:

- Google Maps profile URL and place ID
- matched business name and address
- website URI used for identity matching
- business status
- primary category
- aggregate rating
- aggregate review count

The first release does not store Google review text. Rating and review count are public aggregate signals, not first-party revenue or conversion evidence.

### Brave Web Search API

Environment variable:

```text
BRAVE_SEARCH_API_KEY
```

The collector runs a bounded set of site-specific searches for missing LinkedIn, Facebook, Instagram, and YouTube identities. It uses Brave's structured JSON API rather than scraping search-result HTML.

A result must pass deterministic platform and business-identity checks. Search-discovered profiles are stored as `discovered`, not `active`, and remain verification candidates until stronger evidence confirms ownership.

## Trust rules

- a blocked website remains blocked; external evidence does not imply a website crawl succeeded
- local listing evidence cannot unlock public-web history
- one rating/review-count snapshot is a baseline, not a trend
- search-discovered social profiles are candidates, not verified official accounts
- public engagement and review movement are not revenue attribution
- provider keys are server-side only and never written into Signal Network rows
- provider failures create partial collection status without erasing evidence from successful providers

## Cost controls

- Google Places requests use an explicit field mask and at most five candidates
- Brave searches are limited to missing platforms and at most four queries per owned-business run
- external collection runs for the owned business by default
- peer external enrichment is disabled unless this environment variable is set:

```text
SIGNAL_EXTERNAL_PEERS=true
```

Enable peer enrichment only after reviewing provider quotas and expected portfolio volume.

## Evidence Ledger behavior

The Ledger now separates:

- Public web history
- Local presence
- Social identity
- Social movement
- Content inventory
- Peer context

Overall freshness may be based on current owned external evidence while the Public Web card remains explicitly blocked or unavailable. Each domain has its own collection-day and maturity calculation.

## Activation

1. Add one or both provider keys to Vercel Production and Preview environments.
2. Redeploy the current production commit so serverless functions receive the variables.
3. Open the Evidence Ledger for a tracked domain.
4. Click **Collect business**.
5. Confirm provider status in the collection response and verify new owned sources:
   - `review_profile / google_business_profile`
   - `search_query / brave_search`
   - high-confidence `social_profile` candidates
6. Confirm website evidence remains blocked when robots.txt disallows crawling.
7. Run a later comparable collection before making movement claims.

No additional Supabase migration is required for External Signal Acquisition v1.
