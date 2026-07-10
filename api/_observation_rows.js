// Normalize heterogeneous observation producers to one PostgREST insert shape.
// PostgREST batch inserts require every object in the JSON array to expose the
// same keys. Score rows and check rows intentionally carry different semantics,
// so we normalize optional columns here before a mixed batch insert.

const FIELDS = [
  "entity_key",
  "entity_name",
  "metric",
  "value_numeric",
  "value_text",
  "observed_at",
  "source",
  "dimensions",
];

export function normalizeObservationInsertRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.entity_key && row.metric && row.observed_at)
    .map((row) => ({
      entity_key: String(row.entity_key),
      entity_name: row.entity_name == null ? null : String(row.entity_name),
      metric: String(row.metric),
      value_numeric: Number.isFinite(Number(row.value_numeric)) ? Number(row.value_numeric) : null,
      value_text: row.value_text == null ? null : String(row.value_text),
      observed_at: String(row.observed_at),
      source: row.source == null ? null : String(row.source),
      dimensions: row.dimensions && typeof row.dimensions === "object" ? row.dimensions : {},
    }));
}

export function observationInsertShapeIsUniform(rows = []) {
  const normalized = normalizeObservationInsertRows(rows);
  return normalized.every((row) => {
    const keys = Object.keys(row);
    return keys.length === FIELDS.length && FIELDS.every((field) => keys.includes(field));
  });
}
