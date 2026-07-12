import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../sql/sightline_signal_network_v1.sql", import.meta.url), "utf8");
const patch = await readFile(new URL("../sql/sightline_signal_network_v1_1_local_profile.sql", import.meta.url), "utf8");

for (const sql of [migration, patch]) {
  assert.match(sql, /'local_profile'/);
  assert.match(sql, /drop constraint if exists signal_sources_source_type_check/i);
  assert.match(sql, /add constraint signal_sources_source_type_check/i);
}

assert.match(migration, /create table if not exists public\.signal_sources/i);
assert.match(patch, /alter table public\.signal_sources/i);

console.log("Signal schema compatibility self-test passed: local_profile is allowed for new and existing Signal Network installations.");
