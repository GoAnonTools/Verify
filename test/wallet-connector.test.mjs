import assert from "node:assert/strict";
import {
  DISABLED_EUDI_WALLET_CONNECTOR,
  EUDI_PRIVACY_REQUIREMENTS,
  WalletConnectorDisabledError,
  getBlockingEudiPrivacyRequirements,
} from "./.build/wallet-connector.mjs";

assert.equal(DISABLED_EUDI_WALLET_CONNECTOR.id, "eudi");
assert.equal(DISABLED_EUDI_WALLET_CONNECTOR.enabled, false);
assert.equal(DISABLED_EUDI_WALLET_CONNECTOR.status, "disabled-alpha");
assert.equal(DISABLED_EUDI_WALLET_CONNECTOR.researchLock, "docs/EUDI_RESEARCH_LOCK.md");

assert.ok(EUDI_PRIVACY_REQUIREMENTS.length >= 8);
assert.ok(EUDI_PRIVACY_REQUIREMENTS.every((item) => item.blocking === true));

const ids = EUDI_PRIVACY_REQUIREMENTS.map((item) => item.id);
assert.ok(ids.includes("no-exact-birthdate"));
assert.ok(ids.includes("no-stable-wallet-id"));
assert.ok(ids.includes("no-issuer-callback-during-proof"));
assert.ok(ids.includes("no-goanon-server-during-proof"));
assert.ok(ids.includes("challenge-bound"));
assert.ok(ids.includes("audience-bound"));
assert.ok(ids.includes("not-franceconnect-login"));

const blocking = getBlockingEudiPrivacyRequirements();
assert.equal(blocking.length, EUDI_PRIVACY_REQUIREMENTS.length);

try {
  await DISABLED_EUDI_WALLET_CONNECTOR.connect();
  assert.fail("Expected disabled EUDI connector to throw.");
} catch (err) {
  assert.ok(err instanceof WalletConnectorDisabledError);
  assert.equal(err.code, "GOANON_WALLET_CONNECTOR_DISABLED");
  assert.match(err.message, /not available in this alpha/i);
  assert.match(err.message, /no exact birthdate/i);
  assert.match(err.message, /no stable wallet identifier/i);
  assert.match(err.message, /FranceConnect login is not enabled/i);
}

console.log("wallet connector tests passed");