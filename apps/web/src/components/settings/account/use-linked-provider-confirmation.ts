'use client';

import { useQuery } from '@tanstack/react-query';
import type { Identity } from '@tuturuuu/auth/identity-linking';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useEffect, useState } from 'react';

export type LinkedProviderOutcome = 'linked' | 'unconfirmed';

/**
 * The identity-link redirect carries `settingsLinkedProvider` whether the
 * provider flow succeeded, failed or was cancelled, so the param alone proves
 * nothing. Only a fresh identities read that contains the provider counts.
 */
export function resolveLinkedProviderOutcome(
  provider: string,
  identities: readonly Pick<Identity, 'provider'>[] | undefined
): LinkedProviderOutcome {
  return identities?.some((identity) => identity.provider === provider)
    ? 'linked'
    : 'unconfirmed';
}

type LinkTranslator = (
  key:
    | 'account-link-unconfirmed'
    | 'account-linked-success'
    | 'linked-accounts'
    | 'success',
  values?: Record<string, string>
) => string;

/**
 * Captures the provider from the callback URL, re-reads identities, then shows
 * one toast per callback: success only when the provider is really linked.
 */
export function useLinkedProviderConfirmation({
  fetchIdentities,
  getProviderName,
  linkedProvider,
  t,
}: {
  fetchIdentities: () => Promise<{ identities: Identity[] }>;
  getProviderName: (provider: string) => string;
  linkedProvider?: string;
  t: LinkTranslator;
}) {
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  // The caller strips the URL param after reading it, so keep the provider.
  useEffect(() => {
    if (linkedProvider) setPendingProvider(linkedProvider);
  }, [linkedProvider]);

  const confirmation = useQuery({
    enabled: Boolean(pendingProvider),
    gcTime: 0,
    queryFn: fetchIdentities,
    queryKey: ['linked-identities', 'link-confirmation', pendingProvider],
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!pendingProvider) return;
    if (confirmation.isPending || confirmation.isFetching) return;

    const outcome = confirmation.isSuccess
      ? resolveLinkedProviderOutcome(
          pendingProvider,
          confirmation.data.identities
        )
      : 'unconfirmed';
    const provider = getProviderName(pendingProvider);
    toast(
      outcome === 'linked'
        ? {
            title: t('success'),
            description: t('account-linked-success', { provider }),
          }
        : {
            title: t('linked-accounts'),
            description: t('account-link-unconfirmed', { provider }),
          }
    );
    setPendingProvider(null);
  }, [
    confirmation.data,
    confirmation.isFetching,
    confirmation.isPending,
    confirmation.isSuccess,
    getProviderName,
    pendingProvider,
    t,
  ]);
}
