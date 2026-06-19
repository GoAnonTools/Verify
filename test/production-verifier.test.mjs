import assert from "node:assert/strict";

import {
  GOANON_VERIFY_ERROR_CODES,
} from "../sdk/verify-proof.mjs";

import {
  DEFAULT_PRODUCTION_PROOF_TYPES,
  GOANON_VERIFY_PRODUCTION_ERROR_CODES,
  extractIssuer,
  isTrustedIssuer,
  verifyProductionGoAnonAgeProof,
} from "../sdk/production-verifier.mjs";

const now = Date.now();

function makeProof(overrides = {}) {
  return {
    type: "goanon.age.proof",
    protocol: "goanon.verify.v1",
    mode: "demo-local-test",
    proof_type: "local-demo-not-cryptographic",
    relying_party: {
      origin: "https://example.com",
      domain: "example.com",
      name: "Example Site",
    },
    challenge: "test-challenge-1234567890",
    claim: {
      type: "age_over_threshold",
      threshold: 18,
      result: true,
    },
    issued_at: new Date(now).toISOString(),
    expires_at: now + 60_000,
    disclosed: ["age_over_threshold"],
    not_disclosed: [
      "name",
      "exact_birthdate",
      "id_document",
      "face",
      "wallet_identifier",
    ],
    privacy: {
      grade: "B",
      issuer_contacted_during_proof: false,
      goanon_server_contacted_during_proof: false,
      persistent_identifiers_disclosed: [],
      personal_data_disclosed: ["age_over_threshold"],
    },
    warning: "Local test credential only.",
    issuer: "manual",
    ...overrides,
  };
}

function makeProductionProof(overrides = {}) {
  return makeProof({
    mode: "wallet-presentation",
    proof_type: "cryptographic-wallet-presentation",
    issuer: "did:example:trusted-issuer",
    warning: undefined,
    ...overrides,
  });
}

{
  const result = await verifyProductionGoAnonAgeProof(makeProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_ERROR_CODES.DEMO_PROOF_REJECTED);
}

{
  const result = await verifyProductionGoAnonAgeProof(makeProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
    allowDemo: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.demo, true);
  assert.equal(result.cryptographic, false);
}

{
  const result = await verifyProductionGoAnonAgeProof(makeProductionProof({
    proof_type: "unknown-production-proof",
  }), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
    trustAnchors: ["did:example:trusted-issuer"],
    verifyAgeProof: () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_PRODUCTION_ERROR_CODES.PROOF_TYPE_NOT_ALLOWED);
}

{
  const result = await verifyProductionGoAnonAgeProof(makeProductionProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
    verifyAgeProof: () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_PRODUCTION_ERROR_CODES.TRUST_ANCHORS_REQUIRED);
}

{
  const result = await verifyProductionGoAnonAgeProof(makeProductionProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
    trustAnchors: ["did:example:other-issuer"],
    verifyAgeProof: () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_PRODUCTION_ERROR_CODES.ISSUER_NOT_TRUSTED);
}

{
  const result = await verifyProductionGoAnonAgeProof(makeProductionProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
    trustAnchors: ["did:example:trusted-issuer"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_ERROR_CODES.CRYPTO_VERIFIER_MISSING);
}

{
  let verifierCalled = false;

  const result = await verifyProductionGoAnonAgeProof(makeProductionProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
    trustAnchors: ["did:example:trusted-issuer"],
    verifyAgeProof: () => {
      verifierCalled = true;
      return { ok: true, proof_system: "placeholder-test-verifier" };
    },
  });

  assert.equal(verifierCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.demo, false);
  assert.equal(result.cryptographic, true);
  assert.equal(result.engine.ok, true);
}

{
  assert.deepEqual([...DEFAULT_PRODUCTION_PROOF_TYPES], [
    "cryptographic-wallet-presentation",
    "eudi-wallet-presentation",
    "selective-disclosure-credential",
    "zk-age-proof",
  ]);

  assert.equal(extractIssuer(makeProductionProof()), "did:example:trusted-issuer");
  assert.equal(isTrustedIssuer("did:example:trusted-issuer", ["did:example:trusted-issuer"]), true);
  assert.equal(isTrustedIssuer("did:example:trusted-issuer", [{ id: "did:example:trusted-issuer" }]), true);
  assert.equal(isTrustedIssuer("did:example:trusted-issuer", ["did:example:other-issuer"]), false);
}

console.log("production verifier tests passed");
