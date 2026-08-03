'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createLiveSession,
  InternalApiError,
  type LiveCreditSource,
} from '@tuturuuu/internal-api';
import { useCallback } from 'react';

export type LiveInitializationErrorCode =
  | 'INSUFFICIENT_CREDITS'
  | 'MICROPHONE_DENIED'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

export function classifyLiveInitializationError(
  error: unknown
): LiveInitializationErrorCode {
  if (error instanceof InternalApiError) {
    if (error.code === 'INSUFFICIENT_CREDITS' || error.status === 402) {
      return 'INSUFFICIENT_CREDITS';
    }
    if (error.code === 'LIVE_NOT_CONFIGURED') {
      return 'NOT_CONFIGURED';
    }
  }

  if (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return 'MICROPHONE_DENIED';
  }

  return 'UNKNOWN';
}

export function useEphemeralToken({
  creditSource,
  creditWsId,
  wsId,
}: {
  creditSource: LiveCreditSource;
  creditWsId?: string;
  wsId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = [
    'ephemeral-token',
    wsId,
    creditSource,
    creditWsId ?? null,
  ] as const;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => createLiveSession({ creditSource, creditWsId, wsId }),
    enabled: Boolean(wsId && (creditSource === 'personal' || creditWsId)),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const refreshToken = useCallback(async () => {
    queryClient.removeQueries({ queryKey });
    return refetch();
  }, [queryClient, queryKey, refetch]);

  return {
    error: error as Error | null,
    errorCode: classifyLiveInitializationError(error),
    expiresAt: data?.expiresAt ?? null,
    isLoading,
    liveSessionId: data?.liveSessionId ?? null,
    model: data?.model ?? null,
    refreshToken,
    reservedCredits: data?.reservedCredits ?? 0,
    scopeKey: data?.scopeKey ?? null,
    token: data?.token ?? null,
  };
}
