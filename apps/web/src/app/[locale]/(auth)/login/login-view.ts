import type {
  LoginViewResponse,
  WebAccountSummary,
} from '@tuturuuu/internal-api/auth';
import {
  AUTH_OAUTH_PROVIDERS,
  type AuthOAuthProvider,
} from '@/lib/auth/oauth-providers';

/**
 * What the server knows about the sign-in request: whether a Tuturuuu
 * session exists (with only its name and avatar), the accounts saved on this
 * device, a registry-validated external return app and an advisory provider
 * hint. It carries no email of the session and nothing token-shaped.
 */
export type InitialLoginView = LoginViewResponse;

/** Accepts only a provider the login page can start automatically. */
export function readProviderHint(
  value: string | null | undefined
): (typeof AUTH_OAUTH_PROVIDERS)[number] | null {
  return AUTH_OAUTH_PROVIDERS.find((provider) => provider === value) ?? null;
}

export function isAbsoluteHttpUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * The view is fetched only when it can change what the page does on its
 * own: a provider hint or a cross-app return. A plain sign-in renders the
 * form without waiting for it.
 */
export function shouldResolveLoginView({
  multiAccount,
  provider,
  returnUrl,
}: {
  multiAccount: boolean;
  provider: string | null;
  returnUrl: string | null;
}) {
  return (
    !multiAccount &&
    (readProviderHint(provider) !== null || isAbsoluteHttpUrl(returnUrl))
  );
}

/**
 * A focused external sign-in: a registered external app asks for a provider
 * sign-in. The page then offers only the existing Tuturuuu account, the
 * saved accounts or the hinted provider, in one fixed card.
 */
export function isFocusedExternalSignIn(
  view: InitialLoginView | undefined,
  multiAccount: boolean
) {
  return Boolean(view?.providerHint && view.returnApp && !multiAccount);
}

/** A request that may become a focused sign-in once its view resolves. */
export function mayBeFocusedExternalSignIn({
  multiAccount,
  provider,
  returnUrl,
}: {
  multiAccount: boolean;
  provider: string | null;
  returnUrl: string | null;
}) {
  return (
    !multiAccount &&
    readProviderHint(provider) !== null &&
    isAbsoluteHttpUrl(returnUrl)
  );
}

export type FocusedSignInStep = 'choose' | 'continue' | 'provider';

export function resolveFocusedSignInStep({
  anotherAccountRequested,
  hasSession,
  savedAccounts,
}: {
  anotherAccountRequested: boolean;
  hasSession: boolean;
  savedAccounts: readonly WebAccountSummary[] | null;
}): FocusedSignInStep {
  if (anotherAccountRequested) return 'provider';
  if (hasSession) return 'continue';
  return savedAccounts && savedAccounts.length > 0 ? 'choose' : 'provider';
}

/** Scopes "Use another account" to the provider and return it authorized. */
export function getAnotherAccountRequestKey(
  providerHint: AuthOAuthProvider | null,
  returnUrl: string | null
) {
  return JSON.stringify([providerHint, returnUrl]);
}

/**
 * A provider hint starts the provider without a click only on a plain
 * sign-in with no session, when the device is known to have no saved
 * account or the user asked for another account for this very request.
 * Add-account mode always waits for an explicit provider choice.
 */
export function canAutoStartProvider({
  anotherAccountRequested,
  hasSession,
  multiAccount,
  providerHint,
  savedAccounts,
}: {
  anotherAccountRequested: boolean;
  hasSession: boolean;
  multiAccount: boolean;
  providerHint: AuthOAuthProvider | null;
  /** Null while the saved accounts are unknown. */
  savedAccounts: readonly WebAccountSummary[] | null;
}) {
  if (multiAccount || hasSession || providerHint === null) return false;
  if (anotherAccountRequested) return true;
  return savedAccounts !== null && savedAccounts.length === 0;
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
  savedAccounts: readonly WebAccountSummary[] | null;
}) {
  return (
    !dismissed &&
    !hasSession &&
    !multiAccount &&
    (savedAccounts?.length ?? 0) > 0 &&
    (providerHint !== null || hasCrossAppReturn)
  );
}
