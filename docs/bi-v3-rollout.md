# BI v3 rollout

This phase strengthens trust and reduces manual data entry.

## Peer quality

- deterministic category relevance scoring
- OSM discovery evidence contributes to confidence
- broad category tags are treated cautiously
- obvious adjacent-industry and large-retail mismatches are suppressed
- scheduled rankings are withheld when fewer than three credible peers remain
- competitor-movement BI is suppressed for low-confidence peer sets

## Automatic BI outcomes

- instant-scan leads create `lead_created` BI events without copying email PII
- generated demo contact leads resolve the prospect slug to its domain and create attributable `lead_created` events

## Validation

- contamination regressions cover remodeling vs storage/print/large retail
- contamination regressions cover optometry vs dental/chiropractic/lodging
- low peer counts remain low-confidence
- BI quality CI runs both the existing intelligence suite and peer-quality suite

No database migration is required. This phase uses the existing BI tables.
