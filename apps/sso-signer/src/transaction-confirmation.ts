/**
 * The independent transaction check. Holding the request HMAC key and the
 * permit key is not enough to mint an assertion: the Worker also confirms,
 * through the Worker-only database role `sso_signer`, that an approved,
 * consumed, not-yet-signed transaction exists with exactly these bound
 * fields (`database-confirmation.ts`). Without a configured database every
 * build refuses to sign.
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

/** The verified permit's field hash: the request the issuer approved. */
export type ConfirmedPermit = Readonly<{ fields: string }>;

export interface TransactionConfirmation {
  /**
   * Resolves `ok` only when the consumed transaction `input.transactionId`
   * still binds exactly the client, kid, subject, attributes, profile and
   * request ID in `input`, and those fields hash to `permit.fields`. Must
   * fail closed on any error.
   */
  confirm(
    input: SignInput,
    permit: ConfirmedPermit
  ): Promise<ConfirmationResult>;
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

/** `SSO_SIGNER_TRANSACTION_CHECK` value that selects the database check. */
export const DATABASE_MODE = 'database';

type Selection = Readonly<{ mode: unknown; environment: unknown }>;

/**
 * The pure selection rule for the unchecked path: unchecked only in an
 * unchecked build, with `SSO_SIGNER_TRANSACTION_CHECK` set to
 * `unchecked-local` and `SSO_SIGNER_ENV` set to `local`.
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

/**
 * The database check when `SSO_SIGNER_TRANSACTION_CHECK` is `database` and
 * a database is bound; otherwise refuse.
 */
export function databaseConfirmationFor(
  input: Selection & { database: (() => TransactionConfirmation) | null }
): TransactionConfirmation {
  return input.mode === DATABASE_MODE && input.database
    ? input.database()
    : refuseAllConfirmation;
}

export function selectConfirmation(
  input: Selection & { database: (() => TransactionConfirmation) | null }
): TransactionConfirmation {
  // With the production define the first branch is removed from the bundle.
  if (__SSO_SIGNER_UNCHECKED__ === true) {
    const unchecked = confirmationFor(input, true);
    if (unchecked !== refuseAllConfirmation) return unchecked;
  }
  return databaseConfirmationFor(input);
}
