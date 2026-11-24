/**
 * The independent transaction check. Holding the request HMAC key and the
 * permit key is not enough to mint an assertion: the Worker also confirms,
 * through a dedicated Worker-only database role, that an approved,
 * consumed, not-yet-signed transaction exists with exactly these bound
 * fields. That role and its read path arrive with a later migration; until
 * then every deployed build refuses to sign.
 */
import type { SignInput } from './input';

/**
 * Replaced at build time (see `build-defines.ts`): `false` in the deployed
 * build and in unit tests, `true` only in the workerd runtime test bundle. A
 * build without the define throws here, which refuses the request.
 */
declare const __SSO_SIGNER_UNCHECKED__: boolean;

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

/** Skips the check. Reachable only in the runtime test bundle. */
export const uncheckedLocalConfirmation: TransactionConfirmation = {
  confirm: async () => ({ ok: true }) as const,
};

type Selection = Readonly<{ mode: unknown; environment: unknown }>;

/**
 * The pure selection rule: unchecked only in an unchecked build, with
 * `SSO_SIGNER_TRANSACTION_CHECK` set to `unchecked-local` and
 * `SSO_SIGNER_ENV` set to `local`.
 */
export function confirmationFor(
  input: Selection,
  uncheckedBuild: boolean
): TransactionConfirmation {
  return uncheckedBuild &&
    input.mode === 'unchecked-local' &&
    input.environment === 'local'
    ? uncheckedLocalConfirmation
    : refuseAllConfirmation;
}

export function selectConfirmation(input: Selection): TransactionConfirmation {
  // With the production define this folds to `refuseAllConfirmation`, and
  // the unchecked branch is removed from the bundle.
  return __SSO_SIGNER_UNCHECKED__ === true
    ? confirmationFor(input, true)
    : refuseAllConfirmation;
}
