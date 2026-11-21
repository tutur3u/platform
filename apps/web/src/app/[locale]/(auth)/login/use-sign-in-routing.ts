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
  const hasKnownSession = initialized
    ? user !== null
    : Boolean(initialView?.hasSession);
  const focusedSignIn = isFocusedExternalSignIn(
    initialView,
    isMultiAccountLogin
  );
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
      hasSession: hasKnownSession,
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
