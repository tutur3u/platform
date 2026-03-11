'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { GatewayModelProviderSummary } from '../mira-gateway-models';
import { toProviderId } from '../provider-logo';

const providerLogoStatus = new Map<string, boolean>();

function hasProviderLogo(provider: string): boolean {
  return providerLogoStatus.get(provider) ?? false;
}

async function checkProviderLogo(provider: string): Promise<boolean> {
  const id = toProviderId(provider);
  const url = `https://models.dev/logos/${id}.svg`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return false;
    const text = await res.text();
    if (text.includes('M9.8132 15.9038')) return false;
    return true;
  } catch {
    return false;
  }
}

export function useSortedProviderList(
  providerSummaries: GatewayModelProviderSummary[]
) {
  const providerKey = useMemo(
    () => providerSummaries.map((provider) => provider.provider).join(','),
    [providerSummaries]
  );

  const providerLogoQuery = useQuery({
    queryKey: ['provider-logos', providerKey],
    queryFn: async () => {
      await Promise.all(
        providerSummaries.map(async ({ provider }) => {
          if (providerLogoStatus.has(provider)) return;
          const logoExists = await checkProviderLogo(provider);
          providerLogoStatus.set(provider, logoExists);
        })
      );

      return true;
    },
    enabled: providerSummaries.length > 0,
    staleTime: Infinity,
  });

  const logoRefreshKey = providerLogoQuery.dataUpdatedAt;

  return useMemo(() => {
    void logoRefreshKey;

    return [...providerSummaries].sort((a, b) => {
      const aIsAllowed = a.allowedCount > 0;
      const bIsAllowed = b.allowedCount > 0;
      if (aIsAllowed !== bIsAllowed) return aIsAllowed ? -1 : 1;

      const aHasLogo = hasProviderLogo(a.provider);
      const bHasLogo = hasProviderLogo(b.provider);
      if (aHasLogo !== bHasLogo) return aHasLogo ? -1 : 1;

      return a.provider.localeCompare(b.provider);
    });
  }, [logoRefreshKey, providerSummaries]);
}
