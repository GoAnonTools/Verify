/**
 * GoAnon Verify — EUDI wallet connector scaffold
 *
 * This file models the future wallet-presentation request shape.
 *
 * It is intentionally disabled in alpha.
 *
 * Do not turn this into a live connector until the official wallet path,
 * privacy behavior, issuer trust model, and production verifier have been
 * reviewed.
 */

import { FEATURE_FLAGS } from "./feature-flags";

export const EUDI_WALLET_SCAFFOLD_STATUS = Object.freeze({
  DISABLED_ALPHA: "disabled-alpha",
  RESEARCH_LOCKED: "research-locked",
  READY_FOR_REVIEW: "ready-for-review",
});

export const EUDI_WALLET_PRESENTATION_TYPES = Object.freeze([
  "eudi-wallet-presentation",
  "selective-disclosure-credential",
  "zk-age-proof",
]);

export class EudiWalletConnectorDisabledError extends Error {
  code: string;
  requirements: EudiWalletPrivacyRequirement[];

  constructor(message = "EUDI wallet connector is disabled in this alpha build.") {
    super(message);
    this.name = "EudiWalletConnectorDisabledError";
    this.code = "eudi_wallet_connector_disabled";
    this.requirements = EUDI_WALLET_PRIVACY_REQUIREMENTS;
  }
}

export type EudiWalletPrivacyRequirement = {
  id: string;
  requirement: string;
  required: true;
};

export type EudiWalletPresentationRequest = {
  challenge: string;
  audience: string;
  minAge: number;
  relyingPartyName: string;
  purpose?: string;
};

export type EudiWalletPresentation = {
  type: "goanon.age.proof";
  protocol: "goanon.verify.v1";
  mode: string;
  proof_type: string;
  relying_party: {
    origin: string;
    name?: string;
  };
  challenge: string;
  claim: {
    type: "age_over_threshold";
    threshold: number;
    result: true;
  };
  expires_at: number;
  issuer?: string;
  disclosed: string[];
  not_disclosed: string[];
  privacy: {
    grade: string;
    issuer_contacted_during_proof: boolean;
    goanon_server_contacted_during_proof: boolean;
    persistent_identifiers_disclosed: string[];
    personal_data_disclosed: string[];
  };
};

export const EUDI_WALLET_PRIVACY_REQUIREMENTS: EudiWalletPrivacyRequirement[] = Object.freeze([
  {
    id: "age-threshold-only",
    requirement: "Wallet presentation discloses age eligibility only, not exact birthdate.",
    required: true,
  },
  {
    id: "no-raw-id-document",
    requirement: "No raw identity document, passport scan, or ID image is shared with websites.",
    required: true,
  },
  {
    id: "no-face-or-biometric",
    requirement: "No face scan or biometric data is shared with websites.",
    required: true,
  },
  {
    id: "no-stable-wallet-identifier",
    requirement: "No stable wallet/account identifier is disclosed to relying parties.",
    required: true,
  },
  {
    id: "challenge-bound",
    requirement: "Presentation is cryptographically bound to a single-use relying-party challenge.",
    required: true,
  },
  {
    id: "audience-bound",
    requirement: "Presentation is cryptographically bound to the relying-party origin/audience.",
    required: true,
  },
  {
    id: "short-lived",
    requirement: "Presentation is short-lived and expires quickly.",
    required: true,
  },
  {
    id: "no-per-use-issuer-callback",
    requirement: "Normal proof use does not require a per-use issuer or government callback.",
    required: true,
  },
  {
    id: "no-goanon-verify-server-during-proof",
    requirement: "Normal proof use does not require a GoAnon Verify server or other GoAnon ecosystem server.",
    required: true,
  },
]);

export function isEudiWalletScaffoldEnabled() {
  return FEATURE_FLAGS.eudiWalletConnector?.enabled === true;
}

export function getEudiWalletScaffoldStatus() {
  return {
    status: isEudiWalletScaffoldEnabled()
      ? EUDI_WALLET_SCAFFOLD_STATUS.READY_FOR_REVIEW
      : EUDI_WALLET_SCAFFOLD_STATUS.DISABLED_ALPHA,
    enabled: isEudiWalletScaffoldEnabled(),
    protocol: "goanon.verify.v1",
    supportedPresentationTypes: [...EUDI_WALLET_PRESENTATION_TYPES],
    requirements: [...EUDI_WALLET_PRIVACY_REQUIREMENTS],
  };
}

export function validateEudiWalletPresentationRequest(
  request: Partial<EudiWalletPresentationRequest>
): EudiWalletPresentationRequest {
  if (!request || typeof request !== "object") {
    throw new TypeError("Wallet presentation request is required.");
  }

  if (!request.challenge || typeof request.challenge !== "string") {
    throw new TypeError("Wallet presentation request requires a challenge.");
  }

  if (!request.audience || typeof request.audience !== "string") {
    throw new TypeError("Wallet presentation request requires an audience.");
  }

  if (!Number.isInteger(request.minAge) || request.minAge < 13 || request.minAge > 125) {
    throw new TypeError("Wallet presentation request requires a valid minAge.");
  }

  if (!request.relyingPartyName || typeof request.relyingPartyName !== "string") {
    throw new TypeError("Wallet presentation request requires a relyingPartyName.");
  }

  return {
    challenge: request.challenge,
    audience: request.audience,
    minAge: request.minAge,
    relyingPartyName: request.relyingPartyName,
    purpose: request.purpose,
  };
}

export async function requestEudiWalletPresentation(
  request: Partial<EudiWalletPresentationRequest>
): Promise<EudiWalletPresentation> {
  validateEudiWalletPresentationRequest(request);

  if (!isEudiWalletScaffoldEnabled()) {
    throw new EudiWalletConnectorDisabledError();
  }

  throw new EudiWalletConnectorDisabledError(
    "EUDI wallet connector scaffold is present but no reviewed live connector is implemented."
  );
}
