/**
 * GoAnon Verify — Issuer Connectors
 *
 * Public alpha direction:
 *   - EUDI-compatible wallet first
 *   - Local test credential for development only
 *
 * Digital Dignity rule:
 * During normal website proof use, no government, issuer, wallet backend,
 * or GoAnon server should be contacted.
 *
 * A trusted issuer or wallet may be involved when the user first obtains
 * a credential. After that, proving age to websites should disclose only
 * eligibility, not identity.
 */

import type { IssuedCredential } from "./engine.js";

// ─── Issuer registry ──────────────────────────────────────────────────────────

export interface IssuerMeta {
  id: string;
  name: string;
  country: string;
  flag: string;
  icon?: string;
  description: string;
  privacyUrl?: string;
  openAccess: boolean;
  requiresId?: boolean;
  kind?: "official-wallet" | "local-test";
  status?: "experimental" | "available";
  trust?: "official" | "self-attested";
  privacyGrade?: "A" | "B" | "C" | "BLOCKED" | "pending";
  badge?: string;
  privacyNotes?: string[];
  connect: () => Promise<IssuedCredential>;
}

export const ISSUERS: IssuerMeta[] = [
  {
    id: "eudi",
    name: "EUDI-compatible wallet",
    country: "Official age proof",
    flag: "🇪🇺",
    icon: "🇪🇺",
    requiresId: true,
    kind: "official-wallet",
    status: "experimental",
    trust: "official",
    privacyGrade: "pending",
    badge: "Experimental",
    openAccess: false,
    description:
      "Use an official EU wallet age credential. GoAnon requests only age eligibility — not your full identity.",
    privacyNotes: [
      "Goal: prove only that you are over the required age.",
      "No name, exact birthdate, ID document, address, or face should be shared.",
      "GoAnon will only mark this as strong privacy after confirming no issuer/government callback during normal proof use.",
    ],
    connect: connectEudiWallet,
  },
  {
    id: "manual",
    name: "Local test credential",
    country: "Developer testing only",
    flag: "🧪",
    icon: "🧪",
    requiresId: false,
    kind: "local-test",
    status: "available",
    trust: "self-attested",
    privacyGrade: "B",
    badge: "Testing only",
    openAccess: true,
    description:
      "For local development only. Not real age verification and not accepted as a legal identity credential.",
    privacyNotes: [
      "Useful for testing the extension flow.",
      "Not accepted as real age verification.",
      "Does not contact GoAnon, an issuer, or a government service.",
    ],
    connect: connectManual,
  },
];

// ─── EUDI-compatible wallet connector ─────────────────────────────────────────
//
// This is intentionally disabled in the alpha.
//
// The connector should only be enabled after the official wallet flow passes
// the GoAnon privacy gate:
//
//   - no issuer/government callback during normal proof use
//   - no exact birthdate shared with websites
//   - no stable wallet identifier shared
//   - no GoAnon server involved in proof use
//
// Candidate implementation paths may include EUDI / France Identité age
// attributes, OID4VP-style presentation, ISO 18013-7 mobile document
// presentation, or browser-mediated credential APIs if they satisfy the
// privacy gate.

async function connectEudiWallet(): Promise<IssuedCredential> {
  throw new Error(
    "EUDI wallet connection is not available in this alpha yet. " +
    "Next step: implement the official EUDI / France Identité age-verification flow. " +
    "For now, use Local test credential to test the extension locally."
  );
}

// ─── Local test credential connector ──────────────────────────────────────────
//
// This is for development only. It creates or imports a local test credential
// so the extension, popup, content script, demo page, and website SDK can be
// tested end-to-end without a real issuer.
//
// Production websites must not treat this as legal identity or real age proof.

async function connectManual(): Promise<IssuedCredential> {
  return new Promise((resolve, reject) => {
    const handler = (e: Event) => {
      document.removeEventListener("goanon:manual-credential", handler);
      const { credential, error } = (e as CustomEvent).detail;
      if (error) reject(new Error(error));
      else resolve(credential);
    };

    document.addEventListener("goanon:manual-credential", handler);
    document.dispatchEvent(new CustomEvent("goanon:show-manual-import"));
  });
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Converts a birthdate string ("YYYY-MM-DD") to a local GoAnon test credential.
 *
 * This is intentionally for development only. In production, credentials must
 * come from a trusted issuer or wallet.
 */
export async function birthdateStringToCredential(
  birthdateStr: string,
  issuer: string
): Promise<IssuedCredential> {
  const { buildTestCredential } = await import("./engine.js");
  return buildTestCredential(birthdateStr, issuer);
}