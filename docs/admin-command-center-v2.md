# Admin Command Center v2

The private `/admin/` workspace is an executive operating cockpit for Sightline.

## Operating questions

The dashboard is organized around four questions:

1. Where are we making money?
2. What needs attention today?
3. Which businesses are ready for deeper intelligence?
4. What should the operator do next?

## Live sections

- Today's Move: the highest-priority action across risk, campaign outcomes, recommendation measurement, evidence freshness, and pipeline.
- KPI rail: MRR, annual run rate, active clients, pipeline potential, 30-day lead activity, and tracked businesses.
- Revenue Engine: MRR, ARPA, paused MRR, and active-plan revenue mix.
- Pipeline Velocity: 30-day signup and lead velocity plus current funnel-stage distribution.
- Intelligence Portfolio: average score, average readiness, stale evidence count, portfolio bucket distribution, and ranked attention list.
- Campaign Economics: finalized-result coverage, revenue, recorded spend, revenue less recorded campaign spend, and recorded outcomes.
- Recommendation Learning: decisive success rate, average measured lift, successful, unsuccessful/reversed, and inconclusive outcomes.
- Data Freshness: latest audit, observation, business event, and recommendation timestamps.
- Live Activity: one stream across pipeline, leads, campaigns, campaign results, recommendations, and audit refreshes.
- Workspace Launchpad: direct access to prospecting, build, pipeline, leads, outcome completion, Weekly Brief, experiments, and the five-station workflow.

## Trust rules

- Annual run rate is `MRR × 12`, not contracted revenue.
- Pipeline potential is the sum of plan values on open pipeline stages, not a weighted forecast.
- Campaign economics use finalized campaign results only.
- Contribution is revenue less recorded campaign spend only; it is not gross profit.
- Inconclusive recommendation outcomes are excluded from decisive success-rate calculations.
- Readiness is evidence coverage, not business performance.
- Unknown or missing evidence remains visibly missing rather than being converted to zero.

## No migration required

The dashboard uses the existing subscribers, signups, leads, prospect audits, BI observations, BI events, BI insights, and recommendation outcome tables.
