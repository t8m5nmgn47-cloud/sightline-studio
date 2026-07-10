# BI v10 rollout

Experiment Planner turns a Sightline Test recommendation into a controlled, measurable plan.

## Experiment contract

Every experiment requires:

- one specific hypothesis
- one primary metric
- a baseline
- a different variant
- conditions to keep constant
- a minimum number of observations
- a measurement window

Default limits:

- minimum observations: 6
- measurement window: 28 days

Hard validation limits:

- minimum observations must be between 4 and 500
- measurement window must be between 1 and 180 days

## Lifecycle

Experiments use the existing `bi_events` table:

- `experiment_planned`
- `experiment_running`
- `experiment_completed`

The Experiment API folds those events into one current experiment state.

## Recommendation connection

Accepted Test cards in the Opportunity Feed can hand off directly to the Experiment Planner with:

- business domain
- recommendation insight ID
- recommendation headline
- recommended action

When a linked running experiment is completed:

- the completion event is stored
- result and measured lift are recorded
- the linked recommendation outcome is updated or created
- the linked insight status becomes `measured`

This closes the loop from recommendation to controlled test to Learning Memory.

## Results

Supported experiment outcomes are:

- successful
- inconclusive
- unsuccessful
- reversed

Measured lift is optional and can be positive or negative.

## Operator workspace

`/intelligence/experiments/` provides:

- experiment planning form
- planned queue
- Start action
- running experiment completion form
- completed result history

## Trust guardrails

- baseline and variant must differ
- one primary metric is required
- underpowered plans are rejected
- experiments must be started before completion
- result labels match the recommendation outcome lifecycle
- linked recommendation measurement is optional; unlinked experiments still preserve experiment history

No database migration is required. Experiments use the existing `bi_events`, `bi_insights`, and `bi_recommendation_outcomes` tables.
