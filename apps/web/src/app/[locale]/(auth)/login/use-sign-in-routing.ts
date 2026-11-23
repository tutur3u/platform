'use client';

import { useState } from 'react';
import {
  canAutoStartProvider,
  getAnotherAccountRequestKey,
  isFocusedExternalSignIn,
  mayBeFocusedExternalSignIn,
  readProviderHint,
  resolveFocusedSignInStep,
  shouldOfferSavedAccountChooser,
} from './login-view';
import type { LoginViewState } from './use-login-view';

/**
 * Decides, from the private login view and the browser session, which
 * sign-in surface the login page shows and whether the hinted provider may
 * start without a click.
 */
export function useSignInRouting({
  initialized,
  localReturnPath,
  loginView,
  returnUrl,
  searchParams,
  user,
}: {
  initialized: boolean;
  localReturnPath: string | null;
  loginView: LoginViewState | undefined;
  returnUrl: string | null;
  searchParams: Pick<URLSearchParams, 'get'>;
  user: { id: string } | null;
}) {
  const [anotherAccountRequestKey, setAnotherAccountRequestKey] = useState<
    string | null
  >(null);
  const initialView = loginView?.data;
  const providerHint = readProviderHint(searchParams.get('provider'));
  const isMultiAccountLogin = searchParams.get('multiAccount') === 'true';
  // "Use another account" counts only for the provider and return it was
  // chosen for; add-account mode never inherits it.
  const anotherAccountRequested =
    anotherAccountRequestKey ===
    getAnotherAccountRequestKey(providerHint, returnUrl);
  // Saved accounts come only from the private view route; while it is
  // pending or failed they are unknown, so a provider never auto-starts.
  const knownSavedAccounts = initialView?.savedAccounts ?? null;
  const savedAccounts = knownSavedAccounts ?? [];
  // The server's answer is authoritative: a session either side sees counts,
  // and only a definitive "absent" from the server (with no browser session)
  // lets a provider start without a click. An unreadable session never does.
  const serverSession = initialView?.sessionStatus === 'present';
  const browserSession = initialized && user !== null;
  const hasKnownSession = initialView
    ? serverSession || browserSession
    : browserSession;
  const sessionDefinitelyAbsent = initialView
    ? initialView.sessionStatus === 'absent' && !browserSession
    : initialized && user === null;
  // The card names the server's session; once the browser session is known
  // it must be that same account, or the regular confirmation takes over.
  const focusedSessionMatches =
    !initialized || !user || user.id === initialView?.session?.id;
  const focusedSignIn =
    focusedSessionMatches &&
    isFocusedExternalSignIn(
      initialView,
      isMultiAccountLogin,
      anotherAccountRequested
    );
  const focusedCanContinue =
    initialized &&
    (user ? user.id === initialView?.session?.id : serverSession);
  const focusedPending =
    Boolean(loginView?.pending) &&
    mayBeFocusedExternalSignIn({
      multiAccount: isMultiAccountLogin,
      provider: providerHint,
      returnUrl,
    });
  const focusedStep = resolveFocusedSignInStep({
    anotherAccountRequested,
    hasSession: hasKnownSession,
    savedAccounts: knownSavedAccounts,
  });
  const showSavedAccountChooser =
    !focusedSignIn &&
    shouldOfferSavedAccountChooser({
      dismissed: anotherAccountRequested,
      hasCrossAppReturn: Boolean(returnUrl && !localReturnPath),
      hasSession: hasKnownSession,
      multiAccount: isMultiAccountLogin,
      providerHint,
      savedAccounts,
    });
  const providerAutoStartAllowed =
    !showSavedAccountChooser &&
    (!focusedSignIn || focusedStep === 'provider') &&
    canAutoStartProvider({
      anotherAccountRequested,
      // "Use another account" signs out locally first, so the earlier
      // server answer is stale and only the browser session counts.
      hasSession: anotherAccountRequested
        ? browserSession
        : !sessionDefinitelyAbsent,
      multiAccount: isMultiAccountLogin,
      providerHint,
      savedAccounts: knownSavedAccounts,
    });
  const requestAnotherAccount = () =>
    setAnotherAccountRequestKey(
      getAnotherAccountRequestKey(providerHint, returnUrl)
    );

  return {
    anotherAccountRequested,
    /**
     * A strict PKCE app lets the matching session continue on its own; an
     * account-link app always waits for the click and says what it links.
     */
    focusedContinueMode: {
      accountLink: initialView?.returnApp?.accountLink === true,
      auto: initialView?.returnApp?.autoContinue === true,
    },
    /** The account a confirmation applies to: browser, else server-seen. */
    selfId: user?.id ?? initialView?.session?.id ?? null,
    focusedCanContinue,
    focusedPending,
    focusedSignIn,
    focusedStep,
    hasKnownSession,
    initialView,
    providerAutoStartAllowed,
    providerHint,
    requestAnotherAccount,
    savedAccounts,
    showSavedAccountChooser,
  };
}
