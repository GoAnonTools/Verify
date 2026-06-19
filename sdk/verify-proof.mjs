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
import { verifyAgeProof } from '../src/engine.js';

export const GOANON_VERIFY_PROTOCOL = 'goanon.verify.v1';

export async function verifyGoAnonAgeProof(proof, verificationKey, options = {}) {
  const envelope = validateGoAnonEnvelope(proof, options);

  if (envelope.mode === 'demo-local-test' || envelope.proof_type === 'local-demo-not-cryptographic') {
    if (!options.allowDemo) {
      return fail('Demo/local-test proofs are not accepted in production verification.');
    }

    return ok({
      demo: true,
      cryptographic: false,
      warning: envelope.warning ?? 'Local demo proof accepted only because allowDemo=true.',
      summary: explainProof(envelope),
    });
  }

  const cryptoResult = await verifyAgeProof(envelope, verificationKey, {
    maxAgeSeconds: options.maxAgeSeconds ?? 300,
    expectedAudience: options.expectedAudience,
    expectedChallenge: options.expectedChallenge,
  });

  if (cryptoResult?.ok === false || cryptoResult === false) {
    return fail('Cryptographic proof verification failed.');
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
    throw new Error('Missing proof envelope.');
  }

  if (proof.type !== 'goanon.age.proof') {
    throw new Error('Unsupported proof type.');
  }

  if (proof.protocol !== GOANON_VERIFY_PROTOCOL && proof.protocol_version !== GOANON_VERIFY_PROTOCOL) {
    throw new Error('Unsupported GoAnon Verify protocol version.');
  }

  const claim = proof.claim;
  if (!claim || typeof claim !== 'object') {
    throw new Error('Missing claim object.');
  }

  if (claim.type !== 'age_over_threshold') {
    throw new Error('Unsupported claim type.');
  }

  if (claim.result !== true) {
    throw new Error('Age claim is not satisfied.');
  }

  const threshold = Number(claim.threshold ?? proof.minAge);
  if (!Number.isInteger(threshold) || threshold < 13 || threshold > 125) {
    throw new Error('Invalid age threshold.');
  }

  if (options.minAge != null && threshold < Number(options.minAge)) {
    throw new Error(`Proof threshold ${threshold} is lower than required minimum ${options.minAge}.`);
  }

  const expiresAt = proof.expires_at ?? proof.presentation?.expires_at;
  if (!Number.isFinite(Number(expiresAt))) {
    throw new Error('Missing proof expiration.');
  }

  if (Date.now() > Number(expiresAt)) {
    throw new Error('Proof has expired.');
  }

  if (options.expectedChallenge) {
    const challenge = proof.challenge ?? proof.presentation?.challenge;
    if (challenge !== options.expectedChallenge) {
      throw new Error('Proof challenge does not match.');
    }
  }

  if (options.expectedAudience) {
    const audience = proof.relying_party?.origin ?? proof.presentation?.audience;
    if (audience !== options.expectedAudience) {
      throw new Error('Proof audience does not match.');
    }
  }

  if (!proof.privacy || typeof proof.privacy !== 'object') {
    throw new Error('Missing privacy label.');
  }

  if (!Array.isArray(proof.disclosed) || !proof.disclosed.includes('age_over_threshold')) {
    throw new Error('Proof does not disclose the required age_over_threshold claim.');
  }

  if (!Array.isArray(proof.not_disclosed)) {
    throw new Error('Missing not_disclosed privacy list.');
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

function ok(extra = {}) {
  return {
    ok: true,
    ...extra,
  };
}

function fail(error) {
  return {
    ok: false,
    error,
  };
}
