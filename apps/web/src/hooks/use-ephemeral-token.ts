'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

async function fetchEphemeralToken(): Promise<{
  token: string;
  fetchedAt: number;
}> {
  const response = await fetch('/api/v1/live/token', { method: 'POST' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch token');
  }
  const { token } = await response.json();
  return { token, fetchedAt: Date.now() };
}

// Token is valid for 30 minutes, refresh if older than 5 minutes to ensure freshness
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

export function useEphemeralToken() {
  const queryClient = useQueryClient();
  const refreshingRef = useRef(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ephemeral-token'],
    queryFn: fetchEphemeralToken,
    staleTime: TOKEN_MAX_AGE_MS,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    // Auto-refresh every 5 minutes to keep token fresh
    refetchInterval: TOKEN_MAX_AGE_MS,
  });

  const refreshToken = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['ephemeral-token'] });
    return refetch();
  }, [queryClient, refetch]);

  // Ensure token is fresh before use (call this before connecting)
  const ensureFreshToken = useCallback(async () => {
    if (refreshingRef.current) return data?.token ?? null;

    const tokenAge = data?.fetchedAt ? Date.now() - data.fetchedAt : Infinity;
    if (tokenAge > TOKEN_MAX_AGE_MS) {
      refreshingRef.current = true;
      try {
        const result = await refetch();
        return result.data?.token ?? null;
      } finally {
        refreshingRef.current = false;
      }
    }
    return data?.token ?? null;
  }, [data, refetch]);

  return {
    token: data?.token ?? null,
    isLoading,
    error: error as Error | null,
    refreshToken,
    ensureFreshToken,
  };
}
