/**
 * GoAnon Verify production verifier interface.
 *
 * This module is a production-facing wrapper around the public proof-envelope
 * verifier. It does not implement the final EUDI / wallet / ZK verifier yet.
 *
 * Its job is to make production requirements explicit:
 * - demo proofs are rejected unless allowDemo=true;
 * - non-demo proofs must use an injected cryptographic verifier;
 * - non-demo proofs must declare an allowed proof type;
 * - non-demo proofs must be checked against an issuer / trust-anchor allowlist.
 */

import {
  GOANON_VERIFY_ERROR_CODES,
  validateGoAnonEnvelope,
  verifyGoAnonAgeProof,
  fail,
} from "./verify-proof.mjs";

export const GOANON_VERIFY_PRODUCTION_ERROR_CODES = Object.freeze({
  ...GOANON_VERIFY_ERROR_CODES,
  PROOF_TYPE_NOT_ALLOWED: "proof_type_not_allowed",
  TRUST_ANCHORS_REQUIRED: "trust_anchors_required",
  ISSUER_NOT_TRUSTED: "issuer_not_trusted",
});

export const DEFAULT_PRODUCTION_PROOF_TYPES = Object.freeze([
  "cryptographic-wallet-presentation",
  "eudi-wallet-presentation",
  "selective-disclosure-credential",
  "zk-age-proof",
]);

export async function verifyProductionGoAnonAgeProof(
  proof,
  verificationKey,
  options = {}
) {
  const envelope = validateGoAnonEnvelope(proof, options);

  const isDemoProof =
    envelope.mode === "demo-local-test" ||
    envelope.proof_type === "local-demo-not-cryptographic";

  if (isDemoProof) {
    return verifyGoAnonAgeProof(envelope, verificationKey, {
      ...options,
      allowDemo: options.allowDemo === true,
    });
  }

  const allowedProofTypes =
    options.allowedProofTypes ?? DEFAULT_PRODUCTION_PROOF_TYPES;

  if (
    !envelope.proof_type ||
    !Array.isArray(allowedProofTypes) ||
    !allowedProofTypes.includes(envelope.proof_type)
  ) {
    return fail(
      GOANON_VERIFY_PRODUCTION_ERROR_CODES.PROOF_TYPE_NOT_ALLOWED,
      "Proof type is not allowed for production verification.",
      {
        proof_type: envelope.proof_type,
        allowedProofTypes,
      }
    );
  }

  const trustAnchors = options.trustAnchors ?? options.issuerAllowlist;

  if (!Array.isArray(trustAnchors) || trustAnchors.length === 0) {
    return fail(
      GOANON_VERIFY_PRODUCTION_ERROR_CODES.TRUST_ANCHORS_REQUIRED,
      "Production verification requires a trust-anchor or issuer allowlist."
    );
  }

  const issuer = extractIssuer(envelope);

  if (!issuer || !isTrustedIssuer(issuer, trustAnchors)) {
    return fail(
      GOANON_VERIFY_PRODUCTION_ERROR_CODES.ISSUER_NOT_TRUSTED,
      "Proof issuer is not trusted for production verification.",
      {
        issuer,
      }
    );
  }

  return verifyGoAnonAgeProof(envelope, verificationKey, {
    ...options,
    allowDemo: false,
  });
}

export function extractIssuer(proof) {
  return (
    proof?.issuer ??
    proof?.issuer_id ??
    proof?.credential?.issuer ??
    proof?.presentation?.issuer ??
    proof?.presentation?.issuer_id ??
    null
  );
}

export function isTrustedIssuer(issuer, trustAnchors = []) {
  return trustAnchors.some((anchor) => {
    if (typeof anchor === "string") {
      return anchor === issuer;
    }

    if (!anchor || typeof anchor !== "object") {
      return false;
    }

    return (
      anchor.id === issuer ||
      anchor.issuer === issuer ||
      anchor.issuer_id === issuer ||
      anchor.did === issuer
    );
  });
}
