'use client';
import { useQuery } from '@tanstack/react-query';
import { getPublicWorkspacePrices } from '@tuturuuu/internal-api';

export function usePublicWorkspacePrices() {
  return useQuery({
    queryKey: ['public-workspace-prices'],
    queryFn: () => getPublicWorkspacePrices(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
