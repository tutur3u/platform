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
