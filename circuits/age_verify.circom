pragma circom 2.0.0;

/*
 * goanon.pro — AgeVerify circuit
 *
 * Proves: birthdate_days < (today_days - threshold_days)
 *
 * Private inputs (never leave local machine):
 *   - birthdate_days : days since Unix epoch (private)
 *   - salt           : random nonce (private, prevents rainbow-table attacks)
 *
 * Public inputs (shared with verifier):
 *   - today_days     : current date in days since epoch (public)
 *   - threshold_days : e.g. 18 * 365 = 6570 (public)
 *   - commitment     : Poseidon(birthdate_days, salt) — issuer-signed (public)
 *
 * Output:
 *   - is_over_age    : 1 if age >= threshold, else circuit fails (constraint)
 *
 * The verifier learns ONLY:
 *   - that you know a birthdate that satisfies the age condition
 *   - that your birthdate matches a commitment signed by a trusted issuer
 *   - nothing else
 */

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

template AgeVerify() {
    // === Private signals (stay on your machine) ===
    signal input birthdate_days;
    signal input salt;

    // === Public signals (shared with verifier, no PII) ===
    signal input today_days;
    signal input threshold_days;
    signal input commitment;     // Poseidon(birthdate_days, salt) from issuer

    // === Output ===
    signal output is_over_age;

    // --- 1. Verify the commitment matches the private birthdate ---
    // This ensures the user can't just claim any birthdate.
    // The commitment is signed by a trusted issuer (bank, eID provider, etc.)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== birthdate_days;
    hasher.inputs[1] <== salt;
    commitment === hasher.out;   // Constraint: commitment must match

    // --- 2. Compute the age cutoff ---
    // cutoff = today - threshold (e.g. today minus 18 years in days)
    signal cutoff;
    cutoff <== today_days - threshold_days;

    // --- 3. Prove birthdate < cutoff (user was born before the cutoff date) ---
    // LessThan(n) checks a < b with n-bit inputs.
    // We use 32 bits — safely covers dates up to year ~11 million.
    component lt = LessThan(32);
    lt.in[0] <== birthdate_days;
    lt.in[1] <== cutoff;

    // This is the core constraint: the proof is invalid unless birthdate < cutoff
    lt.out === 1;

    // Output signal (1 = verified over age)
    is_over_age <== lt.out;
}

component main {public [today_days, threshold_days, commitment]} = AgeVerify();
