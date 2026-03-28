'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

async function fetchMiraToken(wsId: string): Promise<{
  token: string;
  scopeKey: string;
  model: string;
  fetchedAt: number;
}> {
  const response = await fetch('/api/v1/mira/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wsId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch Mira voice token');
  }
  const { token, scopeKey, model } = await response.json();
  return { token, scopeKey, model, fetchedAt: Date.now() };
}

// Token is valid for 30 minutes, refresh if older than 5 minutes
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

export function useMiraToken(wsId: string) {
  const queryClient = useQueryClient();
  const refreshingRef = useRef(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['mira-voice-token', wsId],
    queryFn: () => fetchMiraToken(wsId),
    staleTime: TOKEN_MAX_AGE_MS,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: TOKEN_MAX_AGE_MS,
    enabled: !!wsId,
  });

  const refreshToken = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mira-voice-token', wsId] });
    return refetch();
  }, [queryClient, refetch, wsId]);

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
    scopeKey: data?.scopeKey ?? null,
    model: data?.model ?? null,
    isLoading,
    error: error as Error | null,
    refreshToken,
    ensureFreshToken,
  };
}
