# GoAnon Verify trust anchors

GoAnon Verify uses the term **trust anchor** to describe a verifier-side rule for deciding which issuers, wallets, credentials, or proof systems may be accepted for production verification.

This document is an alpha planning document. It does not claim that GoAnon Verify currently performs legal or production-grade age verification.

## Current alpha status

GoAnon Verify currently supports:

- local development proof envelopes;
- demo/local-test credentials;
- a production verifier interface placeholder;
- challenge binding;
- audience binding;
- expiry checks;
- demo-proof rejection by default;
- production-mode guardrails.

GoAnon Verify does **not** yet include a final production trust model for EUDI, France Identité, selective-disclosure credentials, or ZK proof systems.

Until that work is complete, demo/manual issuers must not be treated as production-trusted issuers.

## What a trust anchor means

A trust anchor can eventually be one or more of:

- an issuer DID;
- an issuer certificate;
- a wallet provider identifier;
- a public key;
- an EUDI trust-list entry;
- a selective-disclosure credential issuer;
- a reviewed ZK verifier key;
- a proof-system policy.

In the current alpha verifier, `trustAnchors` and `issuerAllowlist` are placeholders for this future trust boundary.

Example:

~~~js
const result = await verifyProductionGoAnonAgeProof(proof, verificationKey, {
  expectedAudience: "https://example.com",
  expectedChallenge: challengeFromServer,
  minAge: 18,

  trustAnchors: [
    "did:example:trusted-issuer"
  ],

  verifyAgeProof: async (envelope, verificationKey, context) => {
    // Production implementation must verify:
    // - issuer signature;
    // - proof system;
    // - credential status;
    // - challenge binding;
    // - audience binding;
    // - expiry;
    // - trust-anchor rules.
    return { ok: true };
  }
});
~~~

This example is only a shape. The string `did:example:trusted-issuer` is not a real production trust anchor.

## Demo issuers are not production trust anchors

The local test credential path is development-only.

Do not add these as production trust anchors:

- `manual`;
- `local`;
- `demo`;
- `local-demo`;
- `local-demo-not-cryptographic`;
- self-attested issuer labels;
- test DIDs;
- placeholder keys.

A production verifier must reject demo/local-test proofs unless explicitly running a local development demo with `allowDemo: true`.

This unsafe configuration is blocked by the production verifier and backend demo:

~~~sh
NODE_ENV=production GOANON_VERIFY_ALLOW_DEMO=true npm run demo:backend
~~~

## Future EUDI trust model

For an EUDI-compatible production path, GoAnon Verify should verify the official wallet presentation against the relevant trust model.

Future work may include:

- EUDI trust-list validation;
- issuer metadata resolution;
- wallet attestation validation;
- credential signature verification;
- credential status or revocation checks;
- selective-disclosure proof verification;
- relying-party/audience binding;
- single-use challenge binding;
- proof expiry validation;
- privacy-grade validation.

GoAnon Verify should not mark an EUDI-compatible flow as strong privacy unless it can confirm that normal proof use does not create per-use tracking by an issuer, government endpoint, wallet backend, GoAnon Verify server, or other GoAnon ecosystem server.

## Future ZK trust model

For a ZK proof path, a trust anchor may include:

- reviewed circuit source;
- reviewed verifier code;
- verified circuit artifacts;
- verification key;
- trusted setup documentation, if applicable;
- proof-system parameters;
- issuer credential signature validation before proving;
- challenge and audience constraints enforced inside the proof.

A ZK verifier key alone is not enough if the circuit does not enforce the right public inputs and privacy constraints.

## Production warning

A string allowlist is not enough to make a proof legally or technically production-grade.

A production relying party still needs:

- a real issuer or wallet trust model;
- cryptographic signature/proof validation;
- challenge replay protection;
- audience binding;
- expiry checks;
- proof-type allowlisting;
- clear privacy and compliance review.

GoAnon Verify proves eligibility, not identity.

## JSON config loading

GoAnon Verify includes a small trust-anchor config loader:

~~~js
import {
  loadTrustAnchorConfig
} from "./sdk/trust-anchor-config.mjs";

const verifierConfig = await loadTrustAnchorConfig("./trust-anchors.json");

const result = await verifyProductionGoAnonAgeProof(proof, verificationKey, {
  ...verifierConfig,
  expectedAudience: "https://example.com",
  expectedChallenge: challengeFromServer,
  minAge: 18,
  verifyAgeProof
});
~~~

Example config:

~~~json
{
  "trustAnchors": [
    "did:example:trusted-issuer"
  ],
  "allowedProofTypes": [
    "cryptographic-wallet-presentation",
    "eudi-wallet-presentation",
    "selective-disclosure-credential",
    "zk-age-proof"
  ]
}
~~~

The config loader validates shape and blocks obvious demo/manual issuer labels such as `manual`, `local`, `demo`, and `self-attested`.

This is still an alpha integration convenience. A JSON allowlist does not replace real issuer signature validation, EUDI trust-list validation, wallet verification, selective-disclosure verification, or ZK proof verification.
