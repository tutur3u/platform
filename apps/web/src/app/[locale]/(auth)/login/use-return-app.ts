'use client';

import { useQuery } from '@tanstack/react-query';
import { resolveCrossAppReturnUrlWithInternalApi } from '@tuturuuu/internal-api/auth';
import { useMemo } from 'react';
import { getReturnAppName } from './login-form-parts';
import { requiresAccountConfirmationForReturnApp } from './return-app-confirmation';
import {
  getSafeLocalReturnPath,
  getStaticReturnApp,
  MANAGED_TUTURUUU_RETURN_APP,
} from './return-url-helpers';
import type { LoginViewState } from './use-login-view';

/**
 * Resolves the app a sign-in returns to: a static internal or managed app, the
 * registry app the private login view named, or, only without that view, the
 * cross-app return resolve.
 */
export function useReturnApp({
  loginView,
  returnUrl,
  searchParams,
}: {
  loginView: LoginViewState | undefined;
  returnUrl: string | null;
  searchParams: Pick<URLSearchParams, 'get'>;
}) {
  const localReturnPath = useMemo(
    () => getSafeLocalReturnPath(returnUrl),
    [returnUrl]
  );
  const staticReturnApp = useMemo(
    () => getStaticReturnApp(returnUrl, localReturnPath),
    [localReturnPath, returnUrl]
  );
  // The private login view validates external returns on the server with the
  // same registry matcher as the mint; when it named the app, it is the only
  // validator, so a second client check can never contradict it.
  const viewReturnApp = loginView?.data?.returnApp ?? null;
  const awaitingLoginView = Boolean(loginView?.pending);
  const shouldResolveReturnApp = Boolean(
    returnUrl && !localReturnPath && !staticReturnApp && !viewReturnApp
  );
  const {
    data: resolvedReturnApp,
    isError: didFailToResolveReturnApp,
    // isPending stays true while a request is paused offline, unlike
    // isLoading, so a provider never starts before an unverified target.
    isPending: isResolvingConfiguredReturnApp,
    refetch: refetchResolvedReturnApp,
  } = useQuery({
    enabled: shouldResolveReturnApp && !awaitingLoginView,
    queryFn: async () => {
      const result = await resolveCrossAppReturnUrlWithInternalApi({
        returnUrl: returnUrl ?? '',
      });

      if (!result.targetApp) {
        throw new Error(result.error ?? 'Invalid returnUrl');
      }

      return result;
    },
    queryKey: ['auth', 'cross-app-return', returnUrl],
    retry: false,
    staleTime: 60_000,
  });
  const returnApp =
    staticReturnApp ??
    viewReturnApp?.id ??
    resolvedReturnApp?.targetApp ??
    null;
  const isResolvingReturnApp =
    shouldResolveReturnApp &&
    (awaitingLoginView || isResolvingConfiguredReturnApp);
  const isRegisteredInternalAppReturn =
    staticReturnApp !== null &&
    staticReturnApp !== 'web' &&
    staticReturnApp !== 'platform' &&
    staticReturnApp !== MANAGED_TUTURUUU_RETURN_APP;
  const requiresReturnAppConfirmation = requiresAccountConfirmationForReturnApp(
    returnApp,
    isRegisteredInternalAppReturn,
    searchParams.get('confirmAccount') === '1'
  );
  const returnAppName =
    viewReturnApp?.name ??
    resolvedReturnApp?.appName ??
    getReturnAppName(returnApp);

  return {
    didFailToResolveReturnApp,
    isRegisteredInternalAppReturn,
    isResolvingReturnApp,
    localReturnPath,
    refetchResolvedReturnApp,
    requiresReturnAppConfirmation,
    returnApp,
    returnAppName,
    shouldResolveReturnApp,
  };
}
