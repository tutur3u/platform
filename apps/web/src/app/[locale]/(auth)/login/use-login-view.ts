'use client';

import { useQuery } from '@tanstack/react-query';
import { getLoginViewWithInternalApi } from '@tuturuuu/internal-api/auth';
import { useSearchParams } from 'next/navigation';
import { type InitialLoginView, shouldResolveLoginView } from './login-view';

export type LoginViewState = {
  /** Present once the private view route answered. */
  data: InitialLoginView | undefined;
  /** True while a needed view is still loading. */
  pending: boolean;
};

/**
 * Reads the visitor's login view from a private, no-store route. The login
 * shell itself stays cacheable, so identity never enters shared HTML.
 */
export function useLoginView(): LoginViewState {
  const searchParams = useSearchParams();
  const provider = searchParams.get('provider');
  const returnUrl = searchParams.get('returnUrl');
  const enabled = shouldResolveLoginView({
    multiAccount: searchParams.get('multiAccount') === 'true',
    provider,
    returnUrl,
  });
  const query = useQuery({
    enabled,
    gcTime: 0,
    queryFn: () => getLoginViewWithInternalApi({ provider, returnUrl }),
    queryKey: ['auth', 'login-view', provider, returnUrl],
    retry: 1,
    staleTime: 0,
  });

  return { data: query.data, pending: enabled && query.isPending };
}
