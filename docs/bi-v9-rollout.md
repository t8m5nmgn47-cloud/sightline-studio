# BI v9 rollout

Recommendation Learning Memory closes the BI loop by showing what happened after Sightline advice was accepted, implemented, and measured.

## Measured outcome rules

- `successful` counts as a decisive positive result
- `unsuccessful` counts as a decisive negative result
- `reversed` counts as a decisive negative result because the recommendation was rolled back
- `inconclusive` is measured but excluded from decisive success-rate calculations

This prevents inconclusive tests from inflating or unfairly depressing the decisive success rate.

## Minimum trust threshold

Sightline does not create a positive or negative trust claim until at least two decisive recommendation outcomes exist.

Before that threshold:

- one-off results remain timeline evidence
- repeated inconclusive outcomes can create a Test card recommending tighter measurement design

## Learning categories

Recommendation history is grouped by evidence source into:

- campaign performance
- reputation
- competitive movement
- online health
- evidence building
- other

Category summaries remain separate so a strong result in one area cannot hide weak results in another.

## Learning Memory workspace

`/intelligence/learning/` shows:

- measured outcome count
- decisive result count
- decisive success rate
- inconclusive count
- reversed count
- category-level performance
- average recorded lift when measured lift is available
- newest-first measured outcome timeline

## Opportunity Feed feedback loop

The shared Intelligence feed now includes Recommendation Learning Memory. When enough measured history exists, the feed can surface a meta-level card such as:

- measured recommendations are earning trust
- recommendation outcomes are mixed
- recent outcomes need tighter tests
- too many tests are ending inconclusive

These cards are generated from measured recommendation outcomes only.

## Trust guardrails

- inconclusive is not counted as success or failure
- no trust claim before two decisive outcomes
- category-level memory is preserved
- success rates describe measured history, not guaranteed future results
- low success rates trigger process review rather than automatic blame of one cause
- recommendation outcome notes remain visible in the timeline for context

No database migration is required. Learning Memory uses the existing `bi_insights` and `bi_recommendation_outcomes` tables.
