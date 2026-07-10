# BI v12 rollout

Outcome Completion Queue closes a practical data-quality gap: campaigns are often logged before final bookings and revenue are known.

## Pending versus finalized

A `campaign_sent` event without a `campaign_result` remains pending.

A finalized campaign writes a `campaign_result` even when both bookings and revenue are zero. That preserves the important difference between:

- unknown / not measured yet
- measured zero

## Completion Queue

`/intelligence/outcomes/` shows:

- total campaigns
- pending results
- finalized results
- campaign metadata and send date
- bookings and revenue entry for pending campaigns
- finalized outcome history

## API

`GET /api/campaign-outcomes?domain=...` folds sends and results into one queue.

`POST /api/campaign-outcomes` finalizes a pending campaign by writing:

- `campaign_result` always
- `booking_created` when bookings are greater than zero
- otherwise `sale_completed` when revenue is greater than zero

A true zero result writes only the explicit `campaign_result`.

## Duplicate protection

Normal repeated finalization attempts are rejected once a campaign result exists.

This no-migration implementation does not claim atomic exactly-once protection against two simultaneous requests arriving before either insert is visible. A database uniqueness constraint on entity + campaign + result event would be required for strict concurrency-level exactly-once enforcement.

## Security

The completion API uses fail-closed server-side Basic Auth:

- `ADMIN_PASS` is required
- `ADMIN_USER` defaults to `admin`
- missing credentials return authentication errors
- timing-safe comparison is used after length validation

## Validation

Regression coverage verifies:

- pending send remains pending
- finalized zero remains an honest zero
- pending queue ordering
- result bundle shape
- booking outcome emission
- sale outcome emission
- zero-result event behavior
- duplicate finalization rejection in normal workflow
- revenue and booking validation
- defensive folding of duplicate historical results

No database migration is required for this phase.
