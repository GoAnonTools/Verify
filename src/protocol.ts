/**
 * goanon Verify — public website protocol
 *
 * This file defines the small, explicit protocol that cooperating websites use
 * to request a privacy-preserving age proof from the extension.
 *
 * Important product boundary:
 *   - GoAnon does not modify third-party age gates by default.
 *   - A website must intentionally request a proof.
 *   - The user must consent before a proof is generated.
 */

export const GOANON_PROTOCOL_VERSION = "goanon.verify.v1";
export const GOANON_EVENT_REQUEST = "GOANON_VERIFY_REQUEST";
export const GOANON_EVENT_RESPONSE = "GOANON_VERIFY_RESPONSE";
export const GOANON_EVENT_AVAILABLE = "GOANON_VERIFY_AVAILABLE";

export type PrivacyGrade = "A" | "B" | "C" | "BLOCKED";

export interface PrivacyLabel {
  /** A = local/offline/unlinkable target. C = online issuer/status risk. */
  grade: PrivacyGrade;
  /** True only when the issuer/wallet/government is contacted while proving to a website. */
  issuer_contacted_during_proof: boolean;
  /** True only when a a GoAnon Verify server or any GoAnon ecosystem server is contacted while proving to a website. */
  goanon_server_contacted_during_proof: boolean;
  /** Stable cross-site identifiers intentionally disclosed to the relying party. Should stay empty. */
  persistent_identifiers_disclosed: string[];
  /** Personal attributes intentionally disclosed. Should be ["age_over_threshold"] only. */
  personal_data_disclosed: string[];
  /** Human-readable warning for weaker flows. */
  warning?: string;
}

export const STRONG_PRIVACY_LABEL: PrivacyLabel = Object.freeze({
  grade: "A",
  issuer_contacted_during_proof: false,
  goanon_server_contacted_during_proof: false,
  persistent_identifiers_disclosed: [],
  personal_data_disclosed: ["age_over_threshold"],
});

export interface AgeProofRequest {
  type: typeof GOANON_EVENT_REQUEST;
  requestId: string;
  protocol: typeof GOANON_PROTOCOL_VERSION;
  /** Age threshold requested by the relying party. Defaults to 18. */
  minAge: number;
  /** Relying-party challenge/nonce. Must be unpredictable and single-use. */
  challenge: string;
  /** Human-readable reason shown to the user in the consent screen. */
  reason?: string;
  /** Optional display name shown to the user. The verified origin is always derived from location.origin. */
  relyingPartyName?: string;
}

export interface AgeProofPresentation {
  /** The origin that requested the proof, e.g. https://example.com. */
  audience: string;
  /** The hostname shown to the user, e.g. example.com. */
  domain: string;
  /** Optional display name supplied by the relying party. */
  relyingPartyName?: string;
  /** Relying-party challenge/nonce. */
  challenge: string;
  /** Extension-generated nonce to make the envelope unique. */
  nonce: string;
  /** Unix ms expiry for this presentation envelope. */
  expires_at: number;
}

export interface AgeProofResponseEnvelope<TProof = unknown> {
  type: typeof GOANON_EVENT_RESPONSE;
  requestId: string;
  ok: boolean;
  proof?: TProof;
  error?: string;
}

export function makeRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function makeChallenge(): string {
  return makeRequestId() + makeRequestId();
}

export function makeNonce(): string {
  return makeRequestId();
}

export function normalizeAge(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 13 || n > 125) {
    throw new Error("minAge must be an integer between 13 and 125.");
  }
  return n;
}

export function isValidChallenge(challenge: unknown): challenge is string {
  return typeof challenge === "string" && challenge.length >= 16 && challenge.length <= 512;
}

export function publicPrivacySummary(label: PrivacyLabel): string {
  if (label.grade === "A") {
    return "Strong privacy: local proof, no issuer/government contact during use, no GoAnon Verify server or GoAnon ecosystem server contact.";
  }
  if (label.grade === "B") {
    return "Good privacy: no raw ID shared, but some metadata risk remains.";
  }
  if (label.grade === "C") {
    return "Limited privacy: this method may contact an issuer/status service during verification.";
  }
  return "Blocked: this method is not compatible with GoAnon Digital Dignity rules.";
}
