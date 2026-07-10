# BI v4 rollout

This phase makes Sightline's low-data intelligence more specific by preserving and comparing individual measured audit checks.

## Automatic check history

Fresh instant scans and scheduled audit refreshes now write immutable check observations into `bi_observations` alongside existing score history.

Each check observation includes:

- stable metric key
- pass/fail state
- measured timestamp
- source
- area
- points/impact
- current note

## Exact change intelligence

The Opportunity Feed compares the latest two measurements for each check and can produce:

- `Fix` — Pass → Fail regression
- `Repeat` — Fail → Pass improvement

When several changes exist, the highest-point regression and improvement are surfaced first. Unchanged checks do not create cards.

## UI

The private Intelligence workspace shows:

- observation count
- event count
- changed check count
- peer-set confidence
- latest evidence date

## Validation

The BI quality command now runs:

1. existing BI learning-loop tests
2. peer-quality contamination tests
3. exact check-change tests

No database migration is required. This phase uses the existing `bi_observations` table.
