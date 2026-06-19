/**
 * goanon Verify — Website Integrations
 *
 * Public builds use an explicit integration model only. A cooperating website
 * asks for a proof through the GoAnon Verify website protocol; the extension never
 * manipulates platform internals, cookies, private APIs, or DOM gates.
 */

export interface IntegrationPolicy {
  name: string;
  description: string;
  allowedByDefault: boolean;
}

export const PUBLIC_INTEGRATIONS: IntegrationPolicy[] = [
  {
    name: "GoAnon Verify demo page",
    description: "Reference verifier flow for goanon.pro/verify and local demos.",
    allowedByDefault: true,
  },
  {
    name: "Cooperating websites",
    description: "Any website that explicitly calls the GoAnon Verify request protocol and verifies the returned proof.",
    allowedByDefault: true,
  },
  {
    name: "Future EUDI-compatible wallet flows",
    description: "Wallet/credential integrations that can prove an age threshold without contacting the issuer during normal website use.",
    allowedByDefault: true,
  },
];

export function explainDisabledLegacyAdapters(): string {
  return [
    "Legacy platform-specific adapters are intentionally disabled in the public build.",
    "GoAnon Verify is not a bypass tool; it is a privacy-preserving proof standard for websites that choose to accept it.",
  ].join(" ");
}
