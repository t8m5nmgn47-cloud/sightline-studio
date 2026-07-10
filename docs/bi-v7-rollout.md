# BI v7 rollout

This phase gives Sightline a reliable intelligence cadence after measurement refreshes.

## Schedule

- 08:00 UTC — existing `/api/audit-refresh` measures the next stale prospect batch and eligible peers.
- 09:30 UTC — new `/api/intelligence-refresh` converts recent history into stored actionable insights.

The jobs are intentionally separated so recommendation generation does not race the audit refresh.

## Stored recommendation rules

Only live `Fix`, `Repeat`, and `Test` cards are eligible for scheduled persistence.

The refresh deliberately excludes:

- `Watch` context cards
- Evidence Readiness housekeeping cards
- duplicate headlines already active for the business

## Lifecycle protection

- unchanged active recommendations are left alone
- accepted and measured recommendations are never expired by the cron
- active recommendations that disappear from the live feed receive a 21-day grace period before expiry
- newly stored recommendations receive a 14-day review date

## Processing scope

Each daily intelligence refresh processes the 12 most recently audited businesses. Because the existing audit job rotates through stale prospects, the post-audit batch captures the current and recent audit cohorts without crawling again.

## Security

`/api/intelligence-refresh` uses the same `CRON_SECRET` bearer-token pattern as the existing audit refresh endpoint.

## Validation

The BI regression suite covers:

- actionability filtering
- readiness-card exclusion
- duplicate prevention
- expiry grace period
- accepted/measured workflow protection
- evidence preservation
- review dates

No database migration is required. The refresh uses the existing `bi_insights` table.
