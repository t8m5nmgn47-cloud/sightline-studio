# BI v11 rollout

Campaign Economics distinguishes activity volume from recorded economic value.

## Data semantics

A missing campaign result is not treated as zero. The Campaign Log now separates Results pending from Results finalized. Finalized campaigns write a `campaign_result` event even when bookings and revenue are both zero.

## Metrics

For campaigns with finalized results, Sightline can calculate recorded campaign revenue, bookings/conversions, revenue per campaign, recorded campaign spend, contribution after recorded campaign spend, cost per outcome, and revenue per recipient when audience size exists.

## Important language rule

Contribution after recorded campaign spend is not profit. It is recorded campaign revenue minus recorded campaign spend and excludes cost of goods, labor, fulfillment, commissions, overhead, taxes, and other operating costs unless separately supplied.

## Comparison guardrails

Economics comparisons require at least 3 campaigns and 3 finalized results in each compared group, at least 15% relative difference, comparable channel/offer grouping, and complete spend coverage for contribution comparisons.

## Intelligence and workspace

Economics cards feed the shared Opportunity Feed and Weekly Brief. `/intelligence/economics/` shows coverage, recorded revenue/spend, economic decision cards, and campaign-level revenue, spend, contribution, outcomes, cost per outcome, and revenue per recipient.

## Validation

Regression coverage verifies pending-versus-zero honesty, revenue value versus conversion volume, missing-spend honesty, negative contribution, sample suppression, non-profit labeling, and audience normalization.

No database migration is required. This phase uses the existing `bi_events` table.
