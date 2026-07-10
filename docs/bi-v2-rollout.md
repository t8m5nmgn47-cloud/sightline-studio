# Sightline BI v2 rollout

This phase turns the BI foundation into a measurable learning loop.

## Operator flow

1. Record campaigns and outcomes in `/intelligence/campaigns/`.
2. Open `/intelligence/` for Repeat / Fix / Test / Watch decisions.
3. Accept a recommendation from the Opportunity Feed.
4. Track implementation and measurement in `/intelligence/recommendations/`.
5. Build the owner-facing brief in `/intelligence/brief/`.

## Evidence supported in v2

- campaign timing
- channel performance
- offer performance
- creative performance
- review-theme movement
- historical movement against the stored peer set
- recommendation acceptance, implementation, and measured outcome

## Trust rules

- campaign comparisons require at least three campaigns per compared group
- performance claims require at least four recorded outcomes across the comparison
- relative lift must clear 15% before a winner is reported
- review problems require repeated recent mentions
- peer movement is explicitly described as the stored comparison set, not the whole market
- peer confidence is capped because peer relevance still needs human review
- low-data businesses receive measurement guidance instead of invented performance claims

## No new migration required

This phase uses the existing `bi_events`, `bi_insights`, and `bi_recommendation_outcomes` tables created by the BI foundation migration.
