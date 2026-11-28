/**
 * Whether Web requires a Worker-signed sign-in transaction for every
 * Mastermind handoff, and Web's issuer proof for every Mastermind redemption.
 *
 * Off by default, so the serving Mastermind Worker keeps signing in while it
 * does not yet sign transactions. Turn it on with
 * `MASTERMIND_SIGNIN_TRANSACTION_REQUIRED=true` only after the Worker that
 * signs transactions and forwards the issuer proof is serving. A transaction
 * or issuer proof that is present is always verified, whatever this returns.
 */
export function mastermindSignInTransactionRequired() {
  return process.env.MASTERMIND_SIGNIN_TRANSACTION_REQUIRED === 'true';
}

/**
 * Whether the apex mount's exact callback
 * (`https://tuturuuu.com/mastermind/verify-token`) is switched on. Off by
 * default. While it is on, Web issues and accepts only callback-bound (v2)
 * Mastermind issuer proofs; a legacy v1 proof is refused everywhere.
 */
export function mastermindApexCallbackFlag() {
  return process.env.MASTERMIND_APEX_CALLBACK === 'true';
}

/**
 * The apex callback is admitted only when its flag is on AND every handoff
 * needs a Worker-signed transaction: on the apex, a handoff without one is
 * never accepted.
 */
export function mastermindApexCallbackAdmitted() {
  return mastermindApexCallbackFlag() && mastermindSignInTransactionRequired();
}
