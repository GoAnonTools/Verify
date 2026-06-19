import assert from "node:assert/strict";
import {
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

async function rejectsWith(fn, text) {
  try {
    await fn();
  } catch (err) {
    assert.match(String(err?.message || err), text);
    return;
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

await rejectsWith(
  () => verifyGoAnonAgeProof(makeProof({ protocol: "old-protocol" }), null, {
    allowDemo: true,
  }),
  /Unsupported GoAnon Verify protocol version/
);

await rejectsWith(
  () => verifyGoAnonAgeProof(makeProof({
    claim: { type: "age_over_threshold", threshold: 18, result: false },
  }), null, {
    allowDemo: true,
  }),
  /Age claim is not satisfied/
);

await rejectsWith(
  () => verifyGoAnonAgeProof(makeProof({ expires_at: now - 1 }), null, {
    allowDemo: true,
  }),
  /Proof has expired/
);

await rejectsWith(
  () => verifyGoAnonAgeProof(makeProof(), null, {
    expectedChallenge: "wrong-challenge",
    allowDemo: true,
  }),
  /Proof challenge does not match/
);

await rejectsWith(
  () => verifyGoAnonAgeProof(makeProof(), null, {
    expectedAudience: "https://wrong.example",
    allowDemo: true,
  }),
  /Proof audience does not match/
);

await rejectsWith(
  () => verifyGoAnonAgeProof(makeProof({ disclosed: [] }), null, {
    allowDemo: true,
  }),
  /required age_over_threshold claim/
);

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