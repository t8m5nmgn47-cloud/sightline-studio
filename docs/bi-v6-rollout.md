# BI v6 rollout

Intelligence Portfolio turns per-business BI into an operator triage system across tracked businesses.

## Purpose

The portfolio answers three separate questions:

1. Where is there a measured business signal that deserves attention?
2. Where is the evidence stale or incomplete?
3. Where is the evidence mature enough for deeper intelligence or recommendation measurement?

Urgency is an operator-priority score. It is not a business-performance score, and Evidence Readiness remains a separate measure.

## Triage buckets

- `attention` — a measured check regression deserves action
- `refresh_evidence` — audit evidence is missing or stale
- `measure_recommendation` — an accepted recommendation still needs a measured outcome
- `build_evidence` — evidence coverage is too weak for stronger advice; follow the next evidence unlock
- `intelligence_ready` — evidence is mature enough to use Opportunity Feed and Weekly Brief confidently
- `monitor` — no urgent regression, evidence is current, but readiness is still developing

## Operator workflow

`/intelligence/portfolio/` provides:

- portfolio summary counts by triage bucket
- urgency ordering
- filter by triage bucket
- search by business, domain, or vertical
- current score and Evidence Readiness shown separately
- reason for triage placement
- one next operator action
- direct links to Opportunity Feed, Evidence Readiness, and Weekly Brief

## API

`GET /api/intelligence-portfolio` is protected by the same fail-closed admin middleware as the other private Intelligence APIs.

The portfolio combines:

- tracked prospect/business records
- immutable BI observations
- business events
- recommendation lifecycle state
- peer-set relevance confidence

## Trust rules

- exact regressions outrank generic evidence work
- stale evidence is refreshed before advice is strengthened
- accepted recommendations are routed toward measurement
- sparse-data businesses are told what evidence to collect next
- mature evidence routes to intelligence use, not endless data collection
- urgency and readiness are deliberately separate concepts

No database migration is required.
