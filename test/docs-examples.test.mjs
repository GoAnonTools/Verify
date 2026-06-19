import assert from "node:assert/strict";

import {
  GOANON_VERIFY_ERROR_CODES,
} from "../sdk/verify-proof.mjs";

import {
  GOANON_VERIFY_PRODUCTION_ERROR_CODES,
  verifyProductionGoAnonAgeProof,
} from "../sdk/production-verifier.mjs";

const now = Date.now();

function makeProductionProof(overrides = {}) {
  return {
    type: "goanon.age.proof",
    protocol: "goanon.verify.v1",
    mode: "wallet-presentation",
    proof_type: "cryptographic-wallet-presentation",
    relying_party: {
      origin: "https://example.com",
      domain: "example.com",
      name: "Example Site",
    },
    challenge: "server-generated-single-use-challenge",
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
      "passport_scan",
      "face",
      "biometric_data",
      "wallet_identifier",
      "address",
      "passphrase",
      "encrypted_credential",
    ],
    privacy: {
      grade: "A",
      issuer_contacted_during_proof: false,
      goanon_server_contacted_during_proof: false,
      persistent_identifiers_disclosed: [],
      personal_data_disclosed: ["age_over_threshold"],
    },
    issuer: "did:example:trusted-issuer",
    ...overrides,
  };
}

function makeDemoProof(overrides = {}) {
  return makeProductionProof({
    mode: "demo-local-test",
    proof_type: "local-demo-not-cryptographic",
    issuer: "manual",
    privacy: {
      grade: "B",
      issuer_contacted_during_proof: false,
      goanon_server_contacted_during_proof: false,
      persistent_identifiers_disclosed: [],
      personal_data_disclosed: ["age_over_threshold"],
    },
    warning: "Local test credential only.",
    ...overrides,
  });
}

{
  // Mirrors the production verifier example in docs/INTEGRATION_GUIDE.md.
  let verifierContext = null;

  const proof = makeProductionProof();

  const result = await verifyProductionGoAnonAgeProof(proof, "placeholder-verification-key", {
    expectedAudience: "https://example.com",
    expectedChallenge: "server-generated-single-use-challenge",
    minAge: 18,

    trustAnchors: [
      "did:example:trusted-issuer",
    ],

    verifyAgeProof: async (envelope, verificationKey, context) => {
      verifierContext = {
        envelope,
        verificationKey,
        context,
      };

      assert.equal(envelope.challenge, "server-generated-single-use-challenge");
      assert.equal(envelope.relying_party.origin, "https://example.com");
      assert.equal(verificationKey, "placeholder-verification-key");
      assert.equal(context.expectedAudience, "https://example.com");
      assert.equal(context.expectedChallenge, "server-generated-single-use-challenge");

      return {
        ok: true,
        proof_system: "docs-example-placeholder-verifier",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.demo, false);
  assert.equal(result.cryptographic, true);
  assert.equal(result.engine.ok, true);
  assert.equal(result.engine.proof_system, "docs-example-placeholder-verifier");
  assert.ok(verifierContext);
}

{
  // Docs must remain clear that demo proofs are rejected by default.
  const result = await verifyProductionGoAnonAgeProof(makeDemoProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "server-generated-single-use-challenge",
    minAge: 18,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_ERROR_CODES.DEMO_PROOF_REJECTED);
}

{
  // Docs must remain clear that trust anchors are required for non-demo proofs.
  const result = await verifyProductionGoAnonAgeProof(makeProductionProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "server-generated-single-use-challenge",
    minAge: 18,
    verifyAgeProof: async () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_PRODUCTION_ERROR_CODES.TRUST_ANCHORS_REQUIRED);
}

{
  // Docs must remain clear that trust anchors are not enough without a real verifier.
  const result = await verifyProductionGoAnonAgeProof(makeProductionProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "server-generated-single-use-challenge",
    minAge: 18,
    trustAnchors: [
      "did:example:trusted-issuer",
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_ERROR_CODES.CRYPTO_VERIFIER_MISSING);
}

{
  // Docs must remain clear that wrong trust anchors fail.
  const result = await verifyProductionGoAnonAgeProof(makeProductionProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "server-generated-single-use-challenge",
    minAge: 18,
    trustAnchors: [
      "did:example:wrong-issuer",
    ],
    verifyAgeProof: async () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_PRODUCTION_ERROR_CODES.ISSUER_NOT_TRUSTED);
}

console.log("docs examples tests passed");
