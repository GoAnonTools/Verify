/**
 * GoAnon Verify proof verifier helper for cooperating websites / Node.js backends.
 *
 * This helper validates the public proof envelope before calling the
 * cryptographic verifier.
 *
 * Important:
 * - demo-local-test proofs are rejected by default;
 * - production websites should keep allowDemo=false;
 * - local demos may pass allowDemo=true.
 *
 * Usage:
 *   import { verifyGoAnonAgeProof } from './sdk/verify-proof.mjs';
 *
 *   const result = await verifyGoAnonAgeProof(proof, verificationKey, {
 *     expectedAudience: 'https://example.com',
 *     expectedChallenge: challengeFromSession,
 *     minAge: 18,
 *     allowDemo: false
 *   });
 */
export const GOANON_VERIFY_PROTOCOL = 'goanon.verify.v1';

export const GOANON_VERIFY_ERROR_CODES = Object.freeze({
  MISSING_PROOF: 'missing_proof',
  UNSUPPORTED_PROOF_TYPE: 'unsupported_proof_type',
  PROTOCOL_MISMATCH: 'protocol_mismatch',
  MISSING_CLAIM: 'missing_claim',
  UNSUPPORTED_CLAIM_TYPE: 'unsupported_claim_type',
  AGE_CLAIM_NOT_SATISFIED: 'age_claim_not_satisfied',
  INVALID_THRESHOLD: 'invalid_threshold',
  THRESHOLD_TOO_LOW: 'threshold_too_low',
  MISSING_EXPIRATION: 'missing_expiration',
  PROOF_EXPIRED: 'proof_expired',
  CHALLENGE_MISMATCH: 'challenge_mismatch',
  AUDIENCE_MISMATCH: 'audience_mismatch',
  MISSING_PRIVACY_LABEL: 'missing_privacy_label',
  MISSING_DISCLOSED_CLAIM: 'missing_disclosed_claim',
  MISSING_NOT_DISCLOSED: 'missing_not_disclosed',
  DEMO_PROOF_REJECTED: 'demo_proof_rejected',
  CRYPTO_VERIFIER_MISSING: 'crypto_verifier_missing',
  CRYPTO_VERIFICATION_FAILED: 'crypto_verification_failed',
});

export class GoAnonVerifyProofError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GoAnonVerifyProofError';
    this.code = code;
    this.details = details;
  }
}

export async function verifyGoAnonAgeProof(proof, verificationKey, options = {}) {
  const envelope = validateGoAnonEnvelope(proof, options);

  if (envelope.mode === 'demo-local-test' || envelope.proof_type === 'local-demo-not-cryptographic') {
    if (!options.allowDemo) {
      return fail(
        GOANON_VERIFY_ERROR_CODES.DEMO_PROOF_REJECTED,
        'Demo/local-test proofs are not accepted in production verification.'
      );
    }

    return ok({
      demo: true,
      cryptographic: false,
      warning: envelope.warning ?? 'Local demo proof accepted only because allowDemo=true.',
      summary: explainProof(envelope),
    });
  }

  const verifyAgeProof = options.verifyAgeProof;

  if (typeof verifyAgeProof !== 'function') {
    return fail(
      GOANON_VERIFY_ERROR_CODES.CRYPTO_VERIFIER_MISSING,
      'Cryptographic verifier is not configured. Pass options.verifyAgeProof for production proofs.'
    );
  }

  const cryptoResult = await verifyAgeProof(envelope, verificationKey, {
    maxAgeSeconds: options.maxAgeSeconds ?? 300,
    expectedAudience: options.expectedAudience,
    expectedChallenge: options.expectedChallenge,
  });

  if (cryptoResult?.ok === false || cryptoResult === false) {
    return fail(
      GOANON_VERIFY_ERROR_CODES.CRYPTO_VERIFICATION_FAILED,
      'Cryptographic proof verification failed.',
      { engine: cryptoResult }
    );
  }

  return ok({
    demo: false,
    cryptographic: true,
    summary: explainProof(envelope),
    engine: cryptoResult,
  });
}

export function validateGoAnonEnvelope(proof, options = {}) {
  if (!proof || typeof proof !== 'object') {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.MISSING_PROOF,
      'Missing proof envelope.'
    );
  }

  if (proof.type !== 'goanon.age.proof') {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.UNSUPPORTED_PROOF_TYPE,
      'Unsupported proof type.',
      { received: proof.type }
    );
  }

  if (proof.protocol !== GOANON_VERIFY_PROTOCOL && proof.protocol_version !== GOANON_VERIFY_PROTOCOL) {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.PROTOCOL_MISMATCH,
      'Unsupported GoAnon Verify protocol version.',
      {
        expected: GOANON_VERIFY_PROTOCOL,
        received: proof.protocol ?? proof.protocol_version,
      }
    );
  }

  const claim = proof.claim;
  if (!claim || typeof claim !== 'object') {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.MISSING_CLAIM,
      'Missing claim object.'
    );
  }

  if (claim.type !== 'age_over_threshold') {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.UNSUPPORTED_CLAIM_TYPE,
      'Unsupported claim type.',
      { received: claim.type }
    );
  }

  if (claim.result !== true) {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.AGE_CLAIM_NOT_SATISFIED,
      'Age claim is not satisfied.'
    );
  }

  const threshold = Number(claim.threshold ?? proof.minAge);
  if (!Number.isInteger(threshold) || threshold < 13 || threshold > 125) {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.INVALID_THRESHOLD,
      'Invalid age threshold.',
      { received: claim.threshold ?? proof.minAge }
    );
  }

  if (options.minAge != null && threshold < Number(options.minAge)) {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.THRESHOLD_TOO_LOW,
      `Proof threshold ${threshold} is lower than required minimum ${options.minAge}.`,
      {
        proofThreshold: threshold,
        requiredMinAge: Number(options.minAge),
      }
    );
  }

  const expiresAt = proof.expires_at ?? proof.presentation?.expires_at;
  if (!Number.isFinite(Number(expiresAt))) {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.MISSING_EXPIRATION,
      'Missing proof expiration.'
    );
  }

  if (Date.now() > Number(expiresAt)) {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.PROOF_EXPIRED,
      'Proof has expired.',
      { expiresAt: Number(expiresAt) }
    );
  }

  if (options.expectedChallenge) {
    const challenge = proof.challenge ?? proof.presentation?.challenge;
    if (challenge !== options.expectedChallenge) {
      throwProofError(
        GOANON_VERIFY_ERROR_CODES.CHALLENGE_MISMATCH,
        'Proof challenge does not match.'
      );
    }
  }

  if (options.expectedAudience) {
    const audience = proof.relying_party?.origin ?? proof.presentation?.audience;
    if (audience !== options.expectedAudience) {
      throwProofError(
        GOANON_VERIFY_ERROR_CODES.AUDIENCE_MISMATCH,
        'Proof audience does not match.',
        {
          expected: options.expectedAudience,
          received: audience,
        }
      );
    }
  }

  if (!proof.privacy || typeof proof.privacy !== 'object') {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.MISSING_PRIVACY_LABEL,
      'Missing privacy label.'
    );
  }

  if (!Array.isArray(proof.disclosed) || !proof.disclosed.includes('age_over_threshold')) {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.MISSING_DISCLOSED_CLAIM,
      'Proof does not disclose the required age_over_threshold claim.'
    );
  }

  if (!Array.isArray(proof.not_disclosed)) {
    throwProofError(
      GOANON_VERIFY_ERROR_CODES.MISSING_NOT_DISCLOSED,
      'Missing not_disclosed privacy list.'
    );
  }

  return proof;
}

export function explainProof(proof) {
  const claim = typeof proof?.claim === 'object'
    ? proof.claim
    : { type: proof?.claim, threshold: proof?.minAge, result: undefined };

  return {
    protocol: proof?.protocol ?? proof?.protocol_version,
    mode: proof?.mode,
    proof_type: proof?.proof_type,
    claim,
    minAge: claim?.threshold ?? proof?.minAge,
    issuer: proof?.issuer,
    privacy: proof?.privacy,
    relying_party: proof?.relying_party,
    audience: proof?.relying_party?.origin ?? proof?.presentation?.audience,
    challenge: proof?.challenge ?? proof?.presentation?.challenge,
    issued_at: proof?.issued_at ?? proof?.generated_at,
    expires_at: proof?.expires_at ?? proof?.presentation?.expires_at,
    shares: proof?.disclosed ?? ['age_over_threshold'],
    does_not_share: proof?.not_disclosed ?? ['name', 'exact_birthdate', 'ID document', 'address', 'face', 'wallet identifier'],
    warning: proof?.warning ?? proof?.privacy?.warning,
  };
}

export function fail(code, error, details = {}) {
  return {
    ok: false,
    code,
    error,
    details,
  };
}

function ok(extra = {}) {
  return {
    ok: true,
    ...extra,
  };
}

function throwProofError(code, message, details = {}) {
  throw new GoAnonVerifyProofError(code, message, details);
}
