'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createLiveSession } from '@tuturuuu/internal-api';
import { useCallback, useRef } from 'react';

async function fetchMiraToken(wsId: string): Promise<{
  expiresAt: string;
  liveSessionId: string;
  token: string;
  scopeKey: string;
  model: string;
}> {
  return createLiveSession({
    creditSource: wsId === 'personal' ? 'personal' : 'workspace',
    creditWsId: wsId === 'personal' ? undefined : wsId,
    wsId,
  });
}

export function useMiraToken(wsId: string) {
  const queryClient = useQueryClient();
  const refreshingRef = useRef(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['mira-voice-token', wsId],
    queryFn: () => fetchMiraToken(wsId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    enabled: !!wsId,
  });

  const refreshToken = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['mira-voice-token', wsId] });
    return refetch();
  }, [queryClient, refetch, wsId]);

  const ensureFreshToken = useCallback(async () => {
    if (refreshingRef.current) return data?.token ?? null;

    refreshingRef.current = true;
    try {
      const result = await refetch();
      return result.data?.token ?? null;
    } finally {
      refreshingRef.current = false;
    }
  }, [data, refetch]);

  return {
    expiresAt: data?.expiresAt ?? null,
    token: data?.token ?? null,
    liveSessionId: data?.liveSessionId ?? null,
    scopeKey: data?.scopeKey ?? null,
    model: data?.model ?? null,
    isLoading,
    error: error as Error | null,
    refreshToken,
    ensureFreshToken,
  };
}
