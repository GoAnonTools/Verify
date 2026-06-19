#!/usr/bin/env bash
# goanon.pro — Setup Script
# Run this once to go from zero to a loadable browser extension.
#
# Usage: ./setup.sh [--skip-circuit] [--browser chrome|firefox|both]

set -e

SKIP_CIRCUIT=false
BROWSER="both"

for arg in "$@"; do
  case $arg in
    --skip-circuit) SKIP_CIRCUIT=true ;;
    --browser=*) BROWSER="${arg#*=}" ;;
  esac
done

# ── Colors ────────────────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
DIM="\033[2m"

step()  { echo -e "\n${BOLD}${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "  ${GREEN}✓${RESET} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
fail()  { echo -e "  ${RED}✗${RESET} $1"; exit 1; }
info()  { echo -e "  ${DIM}$1${RESET}"; }

echo ""
echo -e "${BOLD}🔐 goanon.pro — ZK Age Verification Extension${RESET}"
echo -e "${DIM}Digital dignity: prove you're over 18 without sharing who you are.${RESET}"
echo ""

# ── 1. Node version check ─────────────────────────────────────────────────────
step "Checking environment"

NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js ≥ 18 required. Install from https://nodejs.org"
fi
ok "Node.js $(node --version)"

NPM_VERSION=$(npm --version 2>/dev/null)
ok "npm v${NPM_VERSION}"

# ── 2. Install npm dependencies ───────────────────────────────────────────────
step "Installing dependencies"

if [ ! -d "node_modules" ]; then
  npm install --silent
  ok "Dependencies installed"
else
  ok "Dependencies already installed (node_modules exists)"
fi

# ── 3. Circuit toolchain ──────────────────────────────────────────────────────
step "Checking ZK circuit toolchain"

if $SKIP_CIRCUIT; then
  warn "Skipping circuit build (--skip-circuit). Extension won't generate real proofs."
else
  CIRCOM_OK=false
  SNARKJS_OK=false

  if command -v circom &>/dev/null; then
    ok "circom $(circom --version 2>/dev/null | head -1)"
    CIRCOM_OK=true
  else
    warn "circom not found — install with: npm install -g circom"
    warn "  (requires Rust: https://rustup.rs)"
  fi

  if command -v snarkjs &>/dev/null; then
    ok "snarkjs $(snarkjs --version 2>/dev/null)"
    SNARKJS_OK=true
  else
    warn "snarkjs CLI not found — install with: npm install -g snarkjs"
  fi

  if $CIRCOM_OK && $SNARKJS_OK; then
    # Check if circuit already compiled
    if [ -f "circuits/age_verify_final.zkey" ]; then
      ok "Circuit already compiled (circuits/age_verify_final.zkey exists)"
    else
      step "Compiling ZK circuit (this takes ~2 minutes)"
      info "Compiling age_verify.circom…"
      
      mkdir -p keys

      # Download the Powers of Tau file (Hermez ceremony — no trust needed from us)
      if [ ! -f "keys/pot15_final.ptau" ]; then
        info "Downloading Powers of Tau (hermez ceremony, 5MB)…"
        curl -s -L \
          "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau" \
          -o "keys/pot15_final.ptau"
        ok "Powers of Tau downloaded"
      else
        ok "Powers of Tau already present"
      fi

      # Compile the circuit
      circom circuits/age_verify.circom \
        --r1cs --wasm --sym \
        --output circuits/ \
        2>/dev/null
      ok "Circuit compiled → circuits/age_verify_js/"

      # Move WASM to expected location
      if [ -f "circuits/age_verify_js/age_verify.wasm" ]; then
        mv circuits/age_verify_js/age_verify.wasm circuits/age_verify.wasm
      fi

      # Groth16 trusted setup
      info "Running Groth16 setup…"
      snarkjs groth16 setup \
        circuits/age_verify.r1cs \
        keys/pot15_final.ptau \
        circuits/age_verify_0000.zkey \
        2>/dev/null
      
      # Contribute randomness
      ENTROPY=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
      snarkjs zkey contribute \
        circuits/age_verify_0000.zkey \
        circuits/age_verify_final.zkey \
        --name="goanon-setup" \
        -e="$ENTROPY" \
        2>/dev/null

      # Export verification key
      snarkjs zkey export verificationkey \
        circuits/age_verify_final.zkey \
        circuits/verification_key.json \
        2>/dev/null

      # Cleanup intermediate files
      rm -f circuits/age_verify_0000.zkey

      ok "ZK circuit ready ✓"
      ok "  Proving key:      circuits/age_verify_final.zkey"
      ok "  Verification key: circuits/verification_key.json"
      ok "  WASM:             circuits/age_verify.wasm"
    fi
  else
    warn "Circuit build skipped — missing tools above."
    warn "The extension will load but won't generate real ZK proofs."
    warn "Install circom + snarkjs, then run: npm run circuit:build"
  fi
fi

# ── 4. Build the extension ────────────────────────────────────────────────────
step "Building extension"

case $BROWSER in
  chrome)
    node build.mjs --target chrome
    ok "Chrome extension built → dist/chrome/"
    ;;
  firefox)
    node build.mjs --target firefox
    ok "Firefox extension built → dist/firefox/"
    ;;
  both|*)
    node build.mjs
    ok "Chrome extension built  → dist/chrome/"
    ok "Firefox extension built → dist/firefox/"
    ;;
esac

# ── 5. Run tests ──────────────────────────────────────────────────────────────
step "Running tests"
node --experimental-vm-modules test/engine.test.mjs 2>/dev/null && ok "All tests pass" || warn "Some tests failed — check output above"

# ── 6. Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}✅ Setup complete!${RESET}"
echo ""
echo -e "${BOLD}Load in Chrome:${RESET}"
echo -e "  1. Open chrome://extensions"
echo -e "  2. Enable 'Developer mode' (top right)"
echo -e "  3. Click 'Load unpacked' → select ${BOLD}dist/chrome/${RESET}"
echo ""
echo -e "${BOLD}Load in Firefox:${RESET}"
echo -e "  1. Open about:debugging"
echo -e "  2. Click 'This Firefox' → 'Load Temporary Add-on'"
echo -e "  3. Select ${BOLD}dist/firefox/manifest.json${RESET}"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo -e "  - Click the goanon icon → 'Add credential'"
echo -e "  - Start the Yivi relay if self-hosting: ${BOLD}npm run relay:go${RESET} or ${BOLD}npm run relay:node${RESET}"
echo -e "  - Connect via Yivi (recommended, open source)"
echo -e "  - Visit an age-gated site — goanon handles it automatically"
echo ""
echo -e "${DIM}goanon.pro · Digital dignity for everyone${RESET}"
echo ""
