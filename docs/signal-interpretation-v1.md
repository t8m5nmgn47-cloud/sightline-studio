# Signal Interpretation v1

Signal Interpretation converts owned Signal Network evidence into conservative Opportunity Feed and Weekly Brief cards. It is deterministic and does not use peer evidence to make owned-business claims.

## Supported findings

- website access blocked by robots.txt
- local identity baseline established
- local profile match needs verification
- bounded local lookup returned no confident match
- local display name, address, category, or website match changed across collection days
- independently discovered social-profile candidates need verification

## Evidence rules

- owned and peer sources are filtered separately
- a change requires comparable snapshots on at least two different calendar days
- multiple values collected on the same day remain one baseline day
- one local observation is labeled as a baseline, not a trend
- a robots.txt block is an access finding, not a website-quality judgment
- a Geoapify no-match is an evidence gap, not proof that no listing exists
- search-discovered social profiles remain candidates until ownership is verified
- local identity changes do not imply changes in rankings, reviews, leads, or revenue

## Product integration

Signal cards are merged into the existing shared intelligence loader, so the Opportunity Feed and Weekly Brief use the same interpretation rules. Signal-backed cards link to the Evidence Ledger for source inspection.

The Weekly Brief treats access, identity, and social verification findings as baseline evidence. A cross-day local identity change is treated as measured public-signal evidence.

## Schema compatibility

Geoapify uses the provider-neutral `local_profile` source type. Projects that installed Signal Network v1 before this type was introduced must run:

```text
sql/sightline_signal_network_v1_1_local_profile.sql
```

The main `sql/sightline_signal_network_v1.sql` migration is also idempotently upgraded so rerunning it applies the same constraint change.

## No new intelligence tables

Signal Interpretation reads the existing Signal Network tables and returns generated cards through the current intelligence API. It does not add a new persistence layer or duplicate accepted recommendations. Accepted cards continue through the existing `bi_insights` and recommendation-outcome lifecycle.
