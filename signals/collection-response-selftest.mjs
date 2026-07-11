import assert from "node:assert/strict";
import { signalCollectionHttpStatus } from "../api/signal-collect.js";

assert.equal(signalCollectionHttpStatus({ ok: true }), 200);
assert.equal(signalCollectionHttpStatus({ ok: false }), 422);
assert.equal(signalCollectionHttpStatus({ ok: false, setup_required: true }), 503);

console.log("Signal collection response self-test passed: incomplete owned evidence is never returned as a successful 2xx response.");
