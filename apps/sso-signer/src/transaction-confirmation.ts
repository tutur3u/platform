/**
 * The independent transaction check. Holding the request HMAC key and the
 * permit key is not enough to mint an assertion: the Worker also confirms,
 * through a dedicated Worker-only database role, that an approved,
 * consumed, not-yet-signed transaction exists with exactly these bound
 * fields. That role and its read path arrive with a later migration; until
 * then every deployed configuration refuses to sign.
 */
import type { SignInput } from './input';

export type ConfirmationResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      error: 'transaction_unconfirmed' | 'confirmation_unavailable';
    }>;

export interface TransactionConfirmation {
  /**
   * Resolves `ok` only when the consumed transaction `input.transactionId`
   * matches the client, protocol, subject, attributes, profile, request and
   * expiry in `input`. Must fail closed on any error.
   */
  confirm(input: SignInput): Promise<ConfirmationResult>;
}

/** No confirmation source is configured: refuse everything. */
export const refuseAllConfirmation: TransactionConfirmation = Object.freeze({
  confirm: async () =>
    ({ ok: false, error: 'confirmation_unavailable' }) as const,
});

/**
 * Local runtime tests only: skips the check. Selected only when
 * `SSO_SIGNER_TRANSACTION_CHECK` is `unchecked-local` and `SSO_SIGNER_ENV`
 * is `local`; every other combination refuses.
 */
export const uncheckedLocalConfirmation: TransactionConfirmation =
  Object.freeze({ confirm: async () => ({ ok: true }) as const });

export function selectConfirmation(input: {
  mode: unknown;
  environment: unknown;
}): TransactionConfirmation {
  return input.mode === 'unchecked-local' && input.environment === 'local'
    ? uncheckedLocalConfirmation
    : refuseAllConfirmation;
}
