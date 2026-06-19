import assert from "node:assert/strict";
import {
  GOANON_VERIFY_ERROR_CODES,
  GoAnonVerifyProofError,
  verifyGoAnonAgeProof,
  validateGoAnonEnvelope,
  explainProof,
} from "../sdk/verify-proof.mjs";

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

async function rejectsWithCode(fn, code, text) {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof GoAnonVerifyProofError);
    assert.equal(err.name, "GoAnonVerifyProofError");
    assert.equal(err.code, code);
    if (text) assert.match(String(err.message), text);
    return err;
  }

  assert.fail("Expected function to throw.");
}

{
  const result = await verifyGoAnonAgeProof(makeProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_ERROR_CODES.DEMO_PROOF_REJECTED);
  assert.match(result.error, /Demo\/local-test proofs are not accepted/);
}

{
  const result = await verifyGoAnonAgeProof(makeProof(), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
    allowDemo: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.demo, true);
  assert.equal(result.cryptographic, false);
}

await rejectsWithCode(
  () => verifyGoAnonAgeProof(makeProof({ protocol: "old-protocol" }), null, {
    allowDemo: true,
  }),
  GOANON_VERIFY_ERROR_CODES.PROTOCOL_MISMATCH,
  /Unsupported GoAnon Verify protocol version/
);

await rejectsWithCode(
  () => verifyGoAnonAgeProof(makeProof({
    claim: { type: "age_over_threshold", threshold: 18, result: false },
  }), null, {
    allowDemo: true,
  }),
  GOANON_VERIFY_ERROR_CODES.AGE_CLAIM_NOT_SATISFIED,
  /Age claim is not satisfied/
);

await rejectsWithCode(
  () => verifyGoAnonAgeProof(makeProof({ expires_at: now - 1 }), null, {
    allowDemo: true,
  }),
  GOANON_VERIFY_ERROR_CODES.PROOF_EXPIRED,
  /Proof has expired/
);

await rejectsWithCode(
  () => verifyGoAnonAgeProof(makeProof(), null, {
    expectedChallenge: "wrong-challenge",
    allowDemo: true,
  }),
  GOANON_VERIFY_ERROR_CODES.CHALLENGE_MISMATCH,
  /Proof challenge does not match/
);

await rejectsWithCode(
  () => verifyGoAnonAgeProof(makeProof(), null, {
    expectedAudience: "https://wrong.example",
    allowDemo: true,
  }),
  GOANON_VERIFY_ERROR_CODES.AUDIENCE_MISMATCH,
  /Proof audience does not match/
);

await rejectsWithCode(
  () => verifyGoAnonAgeProof(makeProof({ disclosed: [] }), null, {
    allowDemo: true,
  }),
  GOANON_VERIFY_ERROR_CODES.MISSING_DISCLOSED_CLAIM,
  /required age_over_threshold claim/
);

{
  const result = await verifyGoAnonAgeProof(makeProof({
    mode: "wallet-presentation",
    proof_type: "cryptographic-wallet-presentation",
  }), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_ERROR_CODES.CRYPTO_VERIFIER_MISSING);
}

{
  const result = await verifyGoAnonAgeProof(makeProof({
    mode: "wallet-presentation",
    proof_type: "cryptographic-wallet-presentation",
  }), null, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
    verifyAgeProof: () => ({ ok: false, reason: "bad signature" }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, GOANON_VERIFY_ERROR_CODES.CRYPTO_VERIFICATION_FAILED);
  assert.deepEqual(result.details.engine, { ok: false, reason: "bad signature" });
}

{
  const proof = makeProof();
  const envelope = validateGoAnonEnvelope(proof, {
    expectedAudience: "https://example.com",
    expectedChallenge: "test-challenge-1234567890",
    minAge: 18,
  });

  assert.equal(envelope.protocol, "goanon.verify.v1");

  const summary = explainProof(proof);
  assert.equal(summary.protocol, "goanon.verify.v1");
  assert.equal(summary.claim.result, true);
  assert.deepEqual(summary.shares, ["age_over_threshold"]);
}

console.log("verifier tests passed");
