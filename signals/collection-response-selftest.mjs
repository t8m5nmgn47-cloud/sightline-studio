import assert from "node:assert/strict";
import { signalCollectionHttpStatus, signalSchemaUpgradeRequired } from "../api/signal-collect.js";

assert.equal(signalCollectionHttpStatus({ ok: true }), 200);
assert.equal(signalCollectionHttpStatus({ ok: false }), 422);
assert.equal(signalCollectionHttpStatus({ ok: false, setup_required: true }), 503);

assert.equal(signalSchemaUpgradeRequired(new Error('new row for relation "signal_sources" violates check constraint "signal_sources_source_type_check"; source_type local_profile')), true);
assert.equal(signalSchemaUpgradeRequired(new Error("unrelated network timeout")), false);

console.log("Signal collection response self-test passed: incomplete evidence is non-2xx and local_profile constraint failures request the exact schema upgrade.");
