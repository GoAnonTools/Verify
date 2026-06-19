/**
 * GoAnon Verify trust-anchor config loader.
 *
 * This helper loads a small JSON config for production verifier options.
 * It validates shape and blocks obvious demo/manual issuer placeholders.
 *
 * Important:
 * A JSON allowlist is not enough for legal or production-grade age verification.
 * Real production use still requires wallet/EUDI/selective-disclosure/ZK proof
 * verification and a reviewed trust model.
 */

import { readFile } from "node:fs/promises";

export const TRUST_ANCHOR_CONFIG_ERROR_CODES = Object.freeze({
  CONFIG_NOT_OBJECT: "trust_anchor_config_not_object",
  TRUST_ANCHORS_MISSING: "trust_anchors_missing",
  TRUST_ANCHORS_INVALID: "trust_anchors_invalid",
  TRUST_ANCHOR_BLOCKED: "trust_anchor_blocked",
  ALLOWED_PROOF_TYPES_INVALID: "allowed_proof_types_invalid",
});

export class TrustAnchorConfigError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "TrustAnchorConfigError";
    this.code = code;
    this.details = details;
  }
}

export const BLOCKED_DEMO_TRUST_ANCHORS = Object.freeze([
  "manual",
  "local",
  "demo",
  "local-demo",
  "local-demo-not-cryptographic",
  "self-attested",
  "test",
]);

export const DEFAULT_ALLOWED_PROOF_TYPES = Object.freeze([
  "cryptographic-wallet-presentation",
  "eudi-wallet-presentation",
  "selective-disclosure-credential",
  "zk-age-proof",
]);

export async function loadTrustAnchorConfig(pathOrUrl, options = {}) {
  const raw = await readFile(pathOrUrl, "utf8");
  const parsed = JSON.parse(raw);
  return normalizeTrustAnchorConfig(parsed, options);
}

export function normalizeTrustAnchorConfig(config, options = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TrustAnchorConfigError(
      TRUST_ANCHOR_CONFIG_ERROR_CODES.CONFIG_NOT_OBJECT,
      "Trust-anchor config must be a JSON object."
    );
  }

  const trustAnchors = config.trustAnchors ?? config.issuerAllowlist;

  if (!Array.isArray(trustAnchors) || trustAnchors.length === 0) {
    throw new TrustAnchorConfigError(
      TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHORS_MISSING,
      "Trust-anchor config requires a non-empty trustAnchors or issuerAllowlist array."
    );
  }

  const normalizedTrustAnchors = trustAnchors.map((anchor, index) =>
    normalizeTrustAnchor(anchor, index, options)
  );

  const allowedProofTypes =
    config.allowedProofTypes ?? options.defaultAllowedProofTypes ?? DEFAULT_ALLOWED_PROOF_TYPES;

  if (
    !Array.isArray(allowedProofTypes) ||
    allowedProofTypes.length === 0 ||
    !allowedProofTypes.every((item) => typeof item === "string" && item.trim())
  ) {
    throw new TrustAnchorConfigError(
      TRUST_ANCHOR_CONFIG_ERROR_CODES.ALLOWED_PROOF_TYPES_INVALID,
      "allowedProofTypes must be a non-empty array of strings."
    );
  }

  return {
    trustAnchors: normalizedTrustAnchors,
    allowedProofTypes: allowedProofTypes.map((item) => item.trim()),
  };
}

export function normalizeTrustAnchor(anchor, index = 0, options = {}) {
  if (typeof anchor === "string") {
    const value = anchor.trim();

    if (!value) {
      throw new TrustAnchorConfigError(
        TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHORS_INVALID,
        "Trust-anchor entries must not be empty.",
        { index }
      );
    }

    assertNotBlockedDemoAnchor(value, index, options);

    return value;
  }

  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
    throw new TrustAnchorConfigError(
      TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHORS_INVALID,
      "Trust-anchor entries must be strings or objects.",
      { index }
    );
  }

  const id = anchor.id ?? anchor.issuer ?? anchor.issuer_id ?? anchor.did;

  if (typeof id !== "string" || !id.trim()) {
    throw new TrustAnchorConfigError(
      TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHORS_INVALID,
      "Trust-anchor object entries require id, issuer, issuer_id, or did.",
      { index }
    );
  }

  assertNotBlockedDemoAnchor(id, index, options);

  return {
    ...anchor,
    id: anchor.id ?? id,
  };
}

export function assertNotBlockedDemoAnchor(anchor, index = 0, options = {}) {
  if (options.allowDemoTrustAnchors === true) {
    return;
  }

  const value = String(anchor).trim().toLowerCase();

  if (BLOCKED_DEMO_TRUST_ANCHORS.includes(value)) {
    throw new TrustAnchorConfigError(
      TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHOR_BLOCKED,
      "Demo/manual issuer labels must not be used as production trust anchors.",
      {
        index,
        anchor,
      }
    );
  }
}
