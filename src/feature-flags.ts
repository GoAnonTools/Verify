/**
 * GoAnon Verify — internal feature flags
 *
 * These flags are intentionally source-controlled guardrails.
 *
 * They are not user preferences. They should not be changed casually from UI
 * code, build scripts, or runtime storage.
 */

export type FeatureFlagStatus =
  | "available-dev"
  | "disabled-alpha"
  | "blocked-privacy-review"
  | "future";

export interface FeatureFlag {
  id: string;
  enabled: boolean;
  status: FeatureFlagStatus;
  publicLabel: string;
  reason: string;
  mustNotEnableUntil?: readonly string[];
}

export const FEATURE_FLAGS = {
  localTestCredential: {
    id: "localTestCredential",
    enabled: true,
    status: "available-dev",
    publicLabel: "Local test credential",
    reason:
      "Allowed only for local development and demos. Not legal age verification.",
  },

  eudiWalletConnector: {
    id: "eudiWalletConnector",
    enabled: false,
    status: "disabled-alpha",
    publicLabel: "EUDI-compatible wallet connector",
    reason:
      "Disabled until the EUDI research lock confirms an age-only presentation path that satisfies the Digital Dignity privacy gate.",
    mustNotEnableUntil: [
      "No exact birthdate is disclosed to cooperating websites.",
      "No raw ID document, passport scan, or face image is disclosed to cooperating websites.",
      "No stable wallet, account, or cross-site identifier is disclosed.",
      "No issuer, government, wallet backend, or proof provider callback occurs during normal proof use.",
      "No a GoAnon Verify server or any GoAnon ecosystem server is contacted during normal proof use.",
      "The proof is bound to a single-use relying-party challenge.",
      "The proof is bound to the relying-party origin.",
      "The path is not just a FranceConnect-style identity login.",
      "Verifier trust anchors and relying-party requirements are documented.",
    ],
  },

  franceConnectLoginPath: {
    id: "franceConnectLoginPath",
    enabled: false,
    status: "blocked-privacy-review",
    publicLabel: "FranceConnect login path",
    reason:
      "FranceConnect-style login federation is not the same as an age-only proof path and must not be used as the default GoAnon Verify proof flow.",
    mustNotEnableUntil: [
      "It can prove only age eligibility without full identity disclosure.",
      "It avoids stable cross-site identifiers.",
      "It avoids issuer/provider knowledge of relying-party proof use.",
      "It satisfies the same privacy gate as the EUDI wallet connector.",
    ],
  },

  productionZkProof: {
    id: "productionZkProof",
    enabled: false,
    status: "future",
    publicLabel: "Production cryptographic proof",
    reason:
      "Disabled until circuit artifacts, verifier integration, and trusted setup/review status are production-ready.",
    mustNotEnableUntil: [
      "Circuit artifacts are generated and reviewed.",
      "Verifier integration is complete.",
      "Trusted setup/review status is documented.",
      "Demo-local-test fallback remains rejected by default in production verification.",
    ],
  },
} as const satisfies Record<string, FeatureFlag>;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

export function getFeatureFlag(name: FeatureFlagName): FeatureFlag {
  return FEATURE_FLAGS[name];
}

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name].enabled === true;
}

export function requireFeatureEnabled(name: FeatureFlagName): void {
  const flag = getFeatureFlag(name);

  if (!flag.enabled) {
    throw new FeatureDisabledError(flag);
  }
}

export class FeatureDisabledError extends Error {
  readonly code = "GOANON_FEATURE_DISABLED";
  readonly featureId: string;
  readonly status: FeatureFlagStatus;

  constructor(flag: FeatureFlag) {
    super(`${flag.publicLabel} is disabled: ${flag.reason}`);
    this.name = "FeatureDisabledError";
    this.featureId = flag.id;
    this.status = flag.status;
  }
}