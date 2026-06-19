import assert from "node:assert/strict";
import {
  FEATURE_FLAGS,
  FeatureDisabledError,
  getFeatureFlag,
  isFeatureEnabled,
  requireFeatureEnabled,
} from "./.build/feature-flags.mjs";

assert.equal(FEATURE_FLAGS.localTestCredential.enabled, true);
assert.equal(FEATURE_FLAGS.localTestCredential.status, "available-dev");

assert.equal(FEATURE_FLAGS.eudiWalletConnector.enabled, false);
assert.equal(FEATURE_FLAGS.eudiWalletConnector.status, "disabled-alpha");
assert.ok(FEATURE_FLAGS.eudiWalletConnector.mustNotEnableUntil.length >= 8);

assert.equal(FEATURE_FLAGS.franceConnectLoginPath.enabled, false);
assert.equal(FEATURE_FLAGS.franceConnectLoginPath.status, "blocked-privacy-review");

assert.equal(FEATURE_FLAGS.productionZkProof.enabled, false);
assert.equal(FEATURE_FLAGS.productionZkProof.status, "future");

assert.equal(isFeatureEnabled("localTestCredential"), true);
assert.equal(isFeatureEnabled("eudiWalletConnector"), false);
assert.equal(getFeatureFlag("eudiWalletConnector").publicLabel, "EUDI-compatible wallet connector");

try {
  requireFeatureEnabled("eudiWalletConnector");
  assert.fail("Expected eudiWalletConnector to be disabled.");
} catch (err) {
  assert.ok(err instanceof FeatureDisabledError);
  assert.equal(err.code, "GOANON_FEATURE_DISABLED");
  assert.equal(err.featureId, "eudiWalletConnector");
  assert.equal(err.status, "disabled-alpha");
  assert.match(err.message, /EUDI-compatible wallet connector is disabled/i);
}

console.log("feature flag tests passed");