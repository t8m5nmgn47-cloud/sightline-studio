# BI v5 rollout

Evidence Readiness makes sparse-data BI explicit and honest.

## Purpose

The readiness score is not a business-performance score. It measures whether Sightline has enough evidence to support different classes of recommendations.

## Evidence domains

- Change history
- Campaign sample
- Outcome linkage
- Review signal
- Peer context
- Recommendation learning

Each domain is classified as:

- Not ready
- Developing
- Ready

## Decision support

The readiness model reports:

- overall evidence readiness
- status of each evidence domain
- the next evidence unlock
- intelligence types currently supportable
- a feed card when readiness is still below mature coverage

## Operator workspace

`/intelligence/readiness/` shows the domain-by-domain evidence state and the next data action that unlocks the most useful additional intelligence.

## Trust rule

Readiness and performance are separate concepts. Strong evidence can reveal poor performance, and weak evidence can exist alongside a healthy business. The interface and readiness card state this explicitly.

No database migration is required.
