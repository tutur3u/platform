import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import {
  AUTH_OAUTH_PROVIDERS,
  type AuthOAuthProvider,
} from '@/lib/auth/oauth-providers';

/**
 * What the server knows about the sign-in request before the browser runs:
 * whether a Tuturuuu session exists, the accounts saved on this device and an
 * advisory provider hint. It is provider-agnostic and carries no email of the
 * active session and nothing token-shaped.
 */
export type InitialLoginView = {
  hasSession: boolean;
  providerHint: AuthOAuthProvider | null;
  /** Null when the server could not read the device's saved accounts. */
  savedAccounts: WebAccountSummary[] | null;
};

/** Accepts only a provider the login page can start automatically. */
export function readProviderHint(
  value: string | null | undefined
): AuthOAuthProvider | null {
  return AUTH_OAUTH_PROVIDERS.find((provider) => provider === value) ?? null;
}

/**
 * A provider hint starts the provider without a click only on a plain
 * sign-in of a device that is known to have no session and no saved
 * account. Add-account mode always waits for an explicit provider choice.
 */
export function canAutoStartProvider({
  hasSession,
  multiAccount,
  providerHint,
  savedAccounts,
}: {
  hasSession: boolean;
  multiAccount: boolean;
  providerHint: AuthOAuthProvider | null;
  /** Null while the saved accounts are unknown. */
  savedAccounts: readonly WebAccountSummary[] | null;
}) {
  return (
    providerHint !== null &&
    !hasSession &&
    !multiAccount &&
    savedAccounts !== null &&
    savedAccounts.length === 0
  );
}

/**
 * The saved-account chooser comes before any automatic provider redirect:
 * a device with saved Tuturuuu accounts picks one of them, or explicitly asks
 * for another account, instead of being forced through the hinted provider.
 * It applies only to requests that would otherwise leave the page on their
 * own: a provider hint or a cross-app return.
 */
export function shouldOfferSavedAccountChooser({
  dismissed,
  hasCrossAppReturn,
  hasSession,
  multiAccount,
  providerHint,
  savedAccounts,
}: {
  dismissed: boolean;
  hasCrossAppReturn: boolean;
  hasSession: boolean;
  multiAccount: boolean;
  providerHint: AuthOAuthProvider | null;
  savedAccounts: readonly WebAccountSummary[];
}) {
  return (
    !dismissed &&
    !hasSession &&
    !multiAccount &&
    savedAccounts.length > 0 &&
    (providerHint !== null || hasCrossAppReturn)
  );
}
