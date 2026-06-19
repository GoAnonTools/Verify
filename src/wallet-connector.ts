/**
 * GoAnon Verify — wallet connector scaffold
 *
 * This file prepares the official-wallet path without enabling it.
 *
 * The EUDI / France Identité connector must remain disabled until the research
 * lock confirms a privacy-preserving age-only presentation path.
 */

import type { IssuedCredential } from "./engine.js";

export type WalletConnectorStatus = "disabled-alpha" | "experimental" | "available";
export type WalletConnectorKind = "eudi-compatible-wallet";

export interface WalletPrivacyRequirement {
  id: string;
  requirement: string;
  blocking: boolean;
}

export interface WalletConnector {
  id: string;
  name: string;
  kind: WalletConnectorKind;
  status: WalletConnectorStatus;
  enabled: boolean;
  researchLock: string;
  privacyRequirements: readonly WalletPrivacyRequirement[];
  connect: () => Promise<IssuedCredential>;
}

export const EUDI_RESEARCH_LOCK_PATH = "docs/EUDI_RESEARCH_LOCK.md";

export const EUDI_PRIVACY_REQUIREMENTS: readonly WalletPrivacyRequirement[] = [
  {
    id: "age-threshold-only",
    requirement: "Relying parties receive only age eligibility, not identity.",
    blocking: true,
  },
  {
    id: "no-exact-birthdate",
    requirement: "Exact birthdate is not disclosed to cooperating websites.",
    blocking: true,
  },
  {
    id: "no-id-document-disclosure",
    requirement: "Raw ID documents, passport scans, and face images are not disclosed to websites.",
    blocking: true,
  },
  {
    id: "no-stable-wallet-id",
    requirement: "No stable wallet, account, or cross-site identifier is disclosed.",
    blocking: true,
  },
  {
    id: "no-issuer-callback-during-proof",
    requirement: "Issuer, government, or wallet backend is not contacted during normal proof use.",
    blocking: true,
  },
  {
    id: "no-goanon-server-during-proof",
    requirement: "GoAnon server is not contacted during normal proof use.",
    blocking: true,
  },
  {
    id: "challenge-bound",
    requirement: "Proof is bound to a single-use relying-party challenge.",
    blocking: true,
  },
  {
    id: "audience-bound",
    requirement: "Proof is bound to the relying-party origin.",
    blocking: true,
  },
  {
    id: "not-franceconnect-login",
    requirement: "FranceConnect-style identity login is not treated as the age-only proof path.",
    blocking: true,
  },
];

export const DISABLED_EUDI_CONNECTOR_MESSAGE = [
  "EUDI-compatible wallet connection is not available in this alpha yet.",
  "Official wallet support will stay disabled until docs/EUDI_RESEARCH_LOCK.md confirms a privacy-preserving age-only presentation path.",
  "Required: no exact birthdate to websites, no stable wallet identifier, no issuer/government callback during normal proof use, and no GoAnon server in proof use.",
  "FranceConnect login is not enabled here because login federation is not the same as age-only proof.",
  "For now, use Local test credential to test the extension locally.",
].join(" ");

export class WalletConnectorDisabledError extends Error {
  readonly code = "GOANON_WALLET_CONNECTOR_DISABLED";

  constructor(message = DISABLED_EUDI_CONNECTOR_MESSAGE) {
    super(message);
    this.name = "WalletConnectorDisabledError";
  }
}

export function throwDisabledWalletConnector(): never {
  throw new WalletConnectorDisabledError();
}

export const DISABLED_EUDI_WALLET_CONNECTOR: WalletConnector = {
  id: "eudi",
  name: "EUDI-compatible wallet",
  kind: "eudi-compatible-wallet",
  status: "disabled-alpha",
  enabled: false,
  researchLock: EUDI_RESEARCH_LOCK_PATH,
  privacyRequirements: EUDI_PRIVACY_REQUIREMENTS,
  connect: async () => throwDisabledWalletConnector(),
};

export function getBlockingEudiPrivacyRequirements(): readonly WalletPrivacyRequirement[] {
  return EUDI_PRIVACY_REQUIREMENTS.filter((item) => item.blocking);
}