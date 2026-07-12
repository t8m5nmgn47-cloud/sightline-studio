# External Signal Acquisition v1.1

External Signal Acquisition extends the Signal Network beyond the business website. It is designed for businesses whose website blocks crawling, is unavailable, or does not link every official profile.

## Supported providers

### Geoapify Geocoding and Place Details APIs

Environment variable:

```text
GEOAPIFY_API_KEY
```

The collector uses a bounded amenity-name lookup and then checks at most two Place Details candidates. Identity confidence is based on exact website-domain matching when available, business-name similarity, Geoapify confidence, and place type.

Captured evidence:

- matched local place ID
- matched business name and formatted address
- official website when present in the source data
- primary category
- latitude and longitude
- match confidence and request count
- OpenStreetMap attribution and provider caveats

Geoapify does **not** supply Google ratings or Google review counts. Sightline never invents those fields or labels Geoapify data as a Google Business Profile.

### Brave Web Search API

Environment variable:

```text
BRAVE_SEARCH_API_KEY
```

The collector runs a bounded set of site-specific searches for missing LinkedIn, Facebook, Instagram, and YouTube identities. It uses Brave's structured JSON API rather than scraping search-result HTML.

A result must pass deterministic platform and business-identity checks. Search-discovered profiles are stored as `discovered`, not `active`, and remain verification candidates until stronger evidence confirms ownership.

## Trust rules

- a blocked website remains blocked; external evidence does not imply a website crawl succeeded
- Geoapify local identity cannot unlock public-web history
- one local-identity snapshot is a baseline, not a trend
- Geoapify evidence is not Google review or rating evidence
- search-discovered social profiles are candidates, not verified official accounts
- public visibility movement is not revenue attribution
- provider keys are server-side only and never written into Signal Network rows
- provider failures create partial collection status without erasing evidence from successful providers

## Cost controls

- one Geoapify geocoding request per business run
- at most two Geoapify Place Details requests per business run
- the collector stops early after a strong website-domain match
- Brave searches are limited to missing platforms and at most four queries per owned-business run
- external collection runs for the owned business by default
- peer external enrichment is disabled unless this environment variable is set:

```text
SIGNAL_EXTERNAL_PEERS=true
```

Enable peer enrichment only after reviewing provider quotas and expected portfolio volume.

## Evidence Ledger behavior

The Ledger separates:

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
5. Confirm provider status and verify new owned sources:
   - `local_profile / geoapify`
   - `search_query / geoapify_geocoding`
   - `search_query / brave_search`
   - high-confidence `social_profile` candidates
6. Confirm website evidence remains blocked when robots.txt disallows crawling.
7. Run a later comparable collection before making movement claims.

No additional Supabase migration is required for External Signal Acquisition v1.1.
