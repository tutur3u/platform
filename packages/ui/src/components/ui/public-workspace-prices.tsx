'use client';
import { useQuery } from '@tanstack/react-query';
import { getPublicWorkspacePrices } from '@tuturuuu/internal-api';

export function usePublicWorkspacePrices(options?: { baseUrl?: string }) {
  return useQuery({
    queryKey: ['public-workspace-prices', options?.baseUrl ?? 'same-origin'],
    queryFn: () => getPublicWorkspacePrices(options),
    staleTime: 300_000,
    refetchInterval: 300_000,
    retry: 1,
  });
}
