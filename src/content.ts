/**
 * goanon Verify — Content Script
 *
 * This is the bridge between cooperating websites and the private extension
 * background worker. It listens for explicit GoAnon Verify proof requests from the
 * page and returns a proof only after user consent.
 *
 * It intentionally does NOT manipulate third-party platform internals.
 */

import {
  GOANON_EVENT_AVAILABLE,
  GOANON_EVENT_REQUEST,
  GOANON_EVENT_RESPONSE,
  GOANON_PROTOCOL_VERSION,
  isValidChallenge,
  normalizeAge,
  type AgeProofRequest,
  type AgeProofResponseEnvelope,
} from "./protocol.js";

const PAGE_SOURCE = "goanon-page";
const EXTENSION_SOURCE = "goanon-extension";

announceAvailability();
window.addEventListener("DOMContentLoaded", announceAvailability, { once: true });
setTimeout(announceAvailability, 250);
setTimeout(announceAvailability, 1000);
window.addEventListener("message", handlePageMessage);

type PageMessage = AgeProofRequest & { source?: string };

async function handlePageMessage(event: MessageEvent<PageMessage>) {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== PAGE_SOURCE) return;
  if (event.data.type !== GOANON_EVENT_REQUEST) return;

  const request = event.data;

  try {
    validateRequest(request);
    const status = await chrome.runtime.sendMessage({ action: "GET_STATUS" });
    if (status?.status !== "has_credential") {
      return postResponse({
        requestId: request.requestId,
        ok: false,
        error: "No GoAnon Verify credential is stored in the extension.",
      });
    }

    showGoanonBadge("request");

    const response = await chrome.runtime.sendMessage({
      action: "REQUEST_PROOF",
      request: {
        requestId: request.requestId,
        minAge: normalizeAge(request.minAge ?? 18),
        challenge: request.challenge,
        reason: request.reason ?? "Age verification",
        relyingPartyName: request.relyingPartyName ?? document.title ?? location.hostname,
        audience: location.origin,
        domain: location.hostname,
      },
    });

    if (!response?.success) {
      showGoanonBadge("failed");
      return postResponse({
        requestId: request.requestId,
        ok: false,
        error: response?.error ?? "Proof generation failed.",
      });
    }

    showGoanonBadge("success");
    postResponse({
      requestId: request.requestId,
      ok: true,
      proof: response.proof,
    });
  } catch (err) {
    showGoanonBadge("failed");
    postResponse({
      requestId: request.requestId ?? "unknown",
      ok: false,
      error: (err as Error).message,
    });
  }
}

function validateRequest(request: Partial<AgeProofRequest>) {
  if (request.protocol !== GOANON_PROTOCOL_VERSION) {
    throw new Error("Unsupported GoAnon Verify protocol version.");
  }
  if (!request.requestId || typeof request.requestId !== "string") {
    throw new Error("Missing requestId.");
  }
  if (!isValidChallenge(request.challenge)) {
    throw new Error("Missing or weak relying-party challenge.");
  }
  normalizeAge(request.minAge ?? 18);
}

function postResponse(envelope: Omit<AgeProofResponseEnvelope, "type">) {
  window.postMessage({
    source: EXTENSION_SOURCE,
    type: GOANON_EVENT_RESPONSE,
    protocol: GOANON_PROTOCOL_VERSION,
    ...envelope,
  }, location.origin);
}

function announceAvailability() {
  window.postMessage({
    source: EXTENSION_SOURCE,
    type: GOANON_EVENT_AVAILABLE,
    protocol: GOANON_PROTOCOL_VERSION,
  }, location.origin);
}

// ─── User-visible status badge ────────────────────────────────────────────────

let badgeEl: HTMLElement | null = null;
let badgeTimeout: ReturnType<typeof setTimeout> | null = null;

function showGoanonBadge(state: "request" | "success" | "failed") {
  if (!badgeEl && document.documentElement) {
    badgeEl = document.createElement("div");
    badgeEl.id = "goanon-status-badge";
    badgeEl.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 2147483647;
      padding: 9px 14px;
      border-radius: 10px;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 7px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.34);
      transition: opacity 0.25s;
      pointer-events: none;
    `;
    (document.body || document.documentElement).appendChild(badgeEl);
  }
  if (!badgeEl) return;
  if (badgeTimeout) clearTimeout(badgeTimeout);

  const configs = {
    request: {
      bg: "rgba(24,22,43,0.96)",
      border: "rgba(124,111,255,0.35)",
      color: "#c8c1ff",
      icon: "●",
      text: "goanon: proof requested",
    },
    success: {
      bg: "rgba(20,36,28,0.96)",
      border: "rgba(52,211,153,0.42)",
      color: "#34d399",
      icon: "✓",
      text: "goanon: over-age proof shared",
    },
    failed: {
      bg: "rgba(36,20,20,0.96)",
      border: "rgba(248,113,113,0.42)",
      color: "#f87171",
      icon: "✗",
      text: "goanon: proof cancelled or failed",
    },
  } as const;

  const c = configs[state];
  badgeEl.style.background = c.bg;
  badgeEl.style.border = `1px solid ${c.border}`;
  badgeEl.style.color = c.color;
  badgeEl.style.opacity = "1";
  badgeEl.textContent = `${c.icon} ${c.text}`;

  badgeTimeout = setTimeout(() => {
    if (badgeEl) badgeEl.style.opacity = "0";
  }, state === "request" ? 5000 : 3200);
}
