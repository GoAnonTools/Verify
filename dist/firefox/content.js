// src/protocol.ts
var GOANON_PROTOCOL_VERSION = "goanon-age-v1";
var GOANON_EVENT_REQUEST = "GOANON_VERIFY_REQUEST";
var GOANON_EVENT_RESPONSE = "GOANON_VERIFY_RESPONSE";
var GOANON_EVENT_AVAILABLE = "GOANON_VERIFY_AVAILABLE";
var STRONG_PRIVACY_LABEL = Object.freeze({
  grade: "A",
  issuer_contacted_during_proof: false,
  goanon_server_contacted_during_proof: false,
  persistent_identifiers_disclosed: [],
  personal_data_disclosed: ["age_over_threshold"]
});
function normalizeAge(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 13 || n > 125) {
    throw new Error("minAge must be an integer between 13 and 125.");
  }
  return n;
}
function isValidChallenge(challenge) {
  return typeof challenge === "string" && challenge.length >= 16 && challenge.length <= 512;
}

// src/content.ts
var PAGE_SOURCE = "goanon-page";
var EXTENSION_SOURCE = "goanon-extension";
announceAvailability();
window.addEventListener("DOMContentLoaded", announceAvailability, { once: true });
setTimeout(announceAvailability, 250);
setTimeout(announceAvailability, 1e3);
window.addEventListener("message", handlePageMessage);
async function handlePageMessage(event) {
  if (event.source !== window)
    return;
  if (!event.data || event.data.source !== PAGE_SOURCE)
    return;
  if (event.data.type !== GOANON_EVENT_REQUEST)
    return;
  const request = event.data;
  try {
    validateRequest(request);
    const status = await chrome.runtime.sendMessage({ action: "GET_STATUS" });
    if (status?.status !== "has_credential") {
      return postResponse({
        requestId: request.requestId,
        ok: false,
        error: "No GoAnon credential is stored in the extension."
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
        domain: location.hostname
      }
    });
    if (!response?.success) {
      showGoanonBadge("failed");
      return postResponse({
        requestId: request.requestId,
        ok: false,
        error: response?.error ?? "Proof generation failed."
      });
    }
    showGoanonBadge("success");
    postResponse({
      requestId: request.requestId,
      ok: true,
      proof: response.proof
    });
  } catch (err) {
    showGoanonBadge("failed");
    postResponse({
      requestId: request.requestId ?? "unknown",
      ok: false,
      error: err.message
    });
  }
}
function validateRequest(request) {
  if (request.protocol !== GOANON_PROTOCOL_VERSION) {
    throw new Error("Unsupported GoAnon protocol version.");
  }
  if (!request.requestId || typeof request.requestId !== "string") {
    throw new Error("Missing requestId.");
  }
  if (!isValidChallenge(request.challenge)) {
    throw new Error("Missing or weak relying-party challenge.");
  }
  normalizeAge(request.minAge ?? 18);
}
function postResponse(envelope) {
  window.postMessage({
    source: EXTENSION_SOURCE,
    type: GOANON_EVENT_RESPONSE,
    protocol: GOANON_PROTOCOL_VERSION,
    ...envelope
  }, location.origin);
}
function announceAvailability() {
  window.postMessage({
    source: EXTENSION_SOURCE,
    type: GOANON_EVENT_AVAILABLE,
    protocol: GOANON_PROTOCOL_VERSION
  }, location.origin);
}
var badgeEl = null;
var badgeTimeout = null;
function showGoanonBadge(state) {
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
  if (!badgeEl)
    return;
  if (badgeTimeout)
    clearTimeout(badgeTimeout);
  const configs = {
    request: {
      bg: "rgba(24,22,43,0.96)",
      border: "rgba(124,111,255,0.35)",
      color: "#c8c1ff",
      icon: "\u25CF",
      text: "goanon: proof requested"
    },
    success: {
      bg: "rgba(20,36,28,0.96)",
      border: "rgba(52,211,153,0.42)",
      color: "#34d399",
      icon: "\u2713",
      text: "goanon: over-age proof shared"
    },
    failed: {
      bg: "rgba(36,20,20,0.96)",
      border: "rgba(248,113,113,0.42)",
      color: "#f87171",
      icon: "\u2717",
      text: "goanon: proof cancelled or failed"
    }
  };
  const c = configs[state];
  badgeEl.style.background = c.bg;
  badgeEl.style.border = `1px solid ${c.border}`;
  badgeEl.style.color = c.color;
  badgeEl.style.opacity = "1";
  badgeEl.textContent = `${c.icon} ${c.text}`;
  badgeTimeout = setTimeout(() => {
    if (badgeEl)
      badgeEl.style.opacity = "0";
  }, state === "request" ? 5e3 : 3200);
}
//# sourceMappingURL=content.js.map
