/**
 * GoAnon proof verifier helper for cooperating websites / Node.js backends.
 *
 * Usage:
 *   import { verifyGoAnonAgeProof } from './sdk/verify-proof.mjs';
 *   const result = await verifyGoAnonAgeProof(proof, verificationKey, {
 *     expectedAudience: 'https://example.com',
 *     expectedChallenge: challengeFromSession,
 *   });
 */
import { verifyAgeProof } from '../src/engine.js';

export async function verifyGoAnonAgeProof(proof, verificationKey, options = {}) {
  return verifyAgeProof(proof, verificationKey, {
    maxAgeSeconds: options.maxAgeSeconds ?? 300,
    expectedAudience: options.expectedAudience,
    expectedChallenge: options.expectedChallenge,
  });
}

export function explainProof(proof) {
  return {
    claim: proof?.claim,
    minAge: proof?.minAge,
    issuer: proof?.issuer,
    privacy: proof?.privacy,
    audience: proof?.presentation?.audience,
    expires_at: proof?.presentation?.expires_at,
    shares: ["age_over_threshold"],
    does_not_share: ["name", "birthdate", "ID document", "address", "face", "wallet ID"],
  };
}
