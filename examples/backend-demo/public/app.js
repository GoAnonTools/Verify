const verifyBtn = document.querySelector("#verifyBtn");
const replayBtn = document.querySelector("#replayBtn");
const statusEl = document.querySelector("#status");
const challengeOut = document.querySelector("#challengeOut");
const responseOut = document.querySelector("#responseOut");
const replayOut = document.querySelector("#replayOut");

let lastPayload = null;

function setStatus(message, kind = "muted") {
  statusEl.className = kind;
  statusEl.textContent = message;
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function requestChallenge() {
  const { response, body } = await fetchJson("/api/goanon/challenge?threshold=18");

  if (!response.ok) {
    throw new Error(body.error || "Could not create challenge.");
  }

  return body;
}

async function requestProof(challenge) {
  if (!window.GoAnonVerify?.requestAgeProof) {
    throw new Error("GoAnon Verify SDK was not found. Confirm /goanon-verify.js loaded.");
  }

  return window.GoAnonVerify.requestAgeProof({
    minAge: challenge.threshold,
    challenge: challenge.challenge,
    audience: challenge.audience,
    reason: "GoAnon Verify backend replay-protection demo"
  });
}

async function postProof(payload) {
  return fetchJson("/api/goanon/verify", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

verifyBtn.addEventListener("click", async () => {
  verifyBtn.disabled = true;
  replayBtn.disabled = true;
  replayOut.textContent = "No replay attempted yet.";
  lastPayload = null;

  try {
    setStatus("Creating single-use challenge…");

    const challenge = await requestChallenge();
    challengeOut.textContent = pretty(challenge);

    setStatus("Requesting GoAnon Verify proof from extension…");

    const proof = await requestProof(challenge);

    const payload = {
      challenge: challenge.challenge,
      proof
    };

    setStatus("Sending proof to backend verifier…");

    const { response, body } = await postProof(payload);
    responseOut.textContent = pretty({
      http_status: response.status,
      body
    });

    if (!response.ok) {
      setStatus(`Verification failed: ${body.error || response.status}`, "bad");
      return;
    }

    lastPayload = payload;
    replayBtn.disabled = false;
    setStatus("Verified. Challenge consumed.", "ok");
  } catch (error) {
    responseOut.textContent = pretty({
      error: error.message
    });
    setStatus(error.message, "bad");
  } finally {
    verifyBtn.disabled = false;
  }
});

replayBtn.addEventListener("click", async () => {
  if (!lastPayload) return;

  replayBtn.disabled = true;

  try {
    const { response, body } = await postProof(lastPayload);

    replayOut.textContent = pretty({
      http_status: response.status,
      body
    });

    if (response.status === 409 && body.error === "challenge_already_used") {
      setStatus("Replay rejected correctly.", "ok");
    } else {
      setStatus("Replay result was unexpected. Inspect backend response.", "warn");
    }
  } catch (error) {
    replayOut.textContent = pretty({
      error: error.message
    });
    setStatus(error.message, "bad");
  } finally {
    replayBtn.disabled = false;
  }
});
