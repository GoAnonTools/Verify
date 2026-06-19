import assert from "node:assert/strict";

import {
  EUDI_WALLET_PRIVACY_REQUIREMENTS,
  EUDI_WALLET_SCAFFOLD_STATUS,
  EudiWalletConnectorDisabledError,
  getEudiWalletScaffoldStatus,
  requestEudiWalletPresentation,
  validateEudiWalletPresentationRequest,
} from "./.build/eudi-wallet-scaffold.mjs";

{
  const status = getEudiWalletScaffoldStatus();

  assert.equal(status.enabled, false);
  assert.equal(status.status, EUDI_WALLET_SCAFFOLD_STATUS.DISABLED_ALPHA);
  assert.equal(status.protocol, "goanon.verify.v1");
  assert.ok(status.supportedPresentationTypes.includes("eudi-wallet-presentation"));
  assert.ok(status.requirements.length >= 8);
}

{
  const ids = EUDI_WALLET_PRIVACY_REQUIREMENTS.map((item) => item.id);

  assert.ok(ids.includes("age-threshold-only"));
  assert.ok(ids.includes("no-raw-id-document"));
  assert.ok(ids.includes("no-face-or-biometric"));
  assert.ok(ids.includes("no-stable-wallet-identifier"));
  assert.ok(ids.includes("challenge-bound"));
  assert.ok(ids.includes("audience-bound"));
  assert.ok(ids.includes("short-lived"));
  assert.ok(ids.includes("no-per-use-issuer-callback"));
  assert.ok(ids.includes("no-goanon-verify-server-during-proof"));
}

{
  const request = validateEudiWalletPresentationRequest({
    challenge: "single-use-random-challenge",
    audience: "https://example.com",
    minAge: 18,
    relyingPartyName: "Example Site",
    purpose: "Age eligibility check",
  });

  assert.deepEqual(request, {
    challenge: "single-use-random-challenge",
    audience: "https://example.com",
    minAge: 18,
    relyingPartyName: "Example Site",
    purpose: "Age eligibility check",
  });
}

assert.throws(
  () => validateEudiWalletPresentationRequest({}),
  /requires a challenge/
);

assert.throws(
  () => validateEudiWalletPresentationRequest({
    challenge: "challenge",
    audience: "https://example.com",
    minAge: 12,
    relyingPartyName: "Example Site",
  }),
  /valid minAge/
);

await assert.rejects(
  () => requestEudiWalletPresentation({
    challenge: "single-use-random-challenge",
    audience: "https://example.com",
    minAge: 18,
    relyingPartyName: "Example Site",
  }),
  (error) => {
    assert.ok(error instanceof EudiWalletConnectorDisabledError);
    assert.equal(error.name, "EudiWalletConnectorDisabledError");
    assert.equal(error.code, "eudi_wallet_connector_disabled");
    assert.ok(error.requirements.length >= 8);
    return true;
  }
);

console.log("EUDI wallet scaffold tests passed");
