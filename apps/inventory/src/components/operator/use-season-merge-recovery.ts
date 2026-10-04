'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api/internal-api-error';
import { applyInventorySeasonMerge } from '@tuturuuu/internal-api/inventory';
import { useEffect, useRef } from 'react';
import {
  clearPendingSeasonMerge,
  type PendingSeasonMerge,
  readPendingSeasonMerge,
  savePendingSeasonMerge,
} from './season-merge-recovery';

export function useSeasonMergeRecovery({
  actorId,
  wsId,
  onComplete,
}: {
  actorId: string;
  wsId: string;
  onComplete: () => void;
}) {
  const client = useQueryClient();
  const scope = JSON.stringify([actorId, wsId]);
  const inFlight = useRef(false);
  const currentScope = useRef<string | null>(scope);
  currentScope.current = scope;
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      currentScope.current = null;
    };
  }, [scope]);
  const recoveryKey = (actor: string, workspace: string) =>
    ['inventory', workspace, 'season-merge-recovery', actor] as const;
  const recovery = useQuery({
    queryKey: recoveryKey(actorId, wsId),
    queryFn: () => readPendingSeasonMerge(actorId, wsId),
    enabled: !!actorId,
    networkMode: 'always',
    staleTime: Infinity,
    retry: false,
  });
  const mutation = useMutation({
    retry: false,
    onSettled: () => {
      inFlight.current = false;
    },
    onMutate: (record: PendingSeasonMerge) => ({
      firstAttempt: !readPendingSeasonMerge(record.actorId, record.wsId),
    }),
    mutationFn: async (record: PendingSeasonMerge) => {
      if (
        JSON.stringify([record.actorId, record.wsId]) !== currentScope.current
      )
        throw new Error('Season merge actor changed');
      // A completed single-key storage write precedes any server request.
      // The same frozen body/token is reused; SQL reconciles its receipt first.
      savePendingSeasonMerge(record);
      client.setQueryData(recoveryKey(record.actorId, record.wsId), record);
      return applyInventorySeasonMerge(record.wsId, record.payload);
    },
    onSuccess: (_, record) => {
      clearPendingSeasonMerge(record);
      client.setQueryData(recoveryKey(record.actorId, record.wsId), null);
      if (
        JSON.stringify([record.actorId, record.wsId]) === currentScope.current
      )
        onComplete();
    },
    onError: (error, record, context) => {
      // Auth pause and transport/5xx outcomes retain the unknown operation.
      // Only a first known attempt can definitively reject. A retry 409 may
      // be a lock timeout while its earlier ambiguous transaction still commits.
      if (
        context?.firstAttempt &&
        error instanceof InternalApiError &&
        [400, 404, 409, 422].includes(error.status)
      ) {
        clearPendingSeasonMerge(record);
        client.setQueryData(recoveryKey(record.actorId, record.wsId), null);
      }
    },
  });
  // Reserve synchronously before React Query awaits its mutation callbacks.
  // Two same-tick submissions must not both classify themselves as first.
  const guardedMutation = {
    ...mutation,
    mutate: (record: PendingSeasonMerge) => {
      if (inFlight.current) return;
      inFlight.current = true;
      mutation.mutate(record);
    },
    mutateAsync: (record: PendingSeasonMerge) => {
      if (inFlight.current)
        return Promise.reject(new Error('Season merge already pending'));
      inFlight.current = true;
      return mutation.mutateAsync(record);
    },
  };
  const scopedMutation =
    mutation.variables &&
    JSON.stringify([mutation.variables.actorId, mutation.variables.wsId]) ===
      scope;
  return {
    request: recovery.data ?? null,
    storageError: recovery.isError,
    loading: recovery.isLoading,
    pending: !!scopedMutation && mutation.isPending,
    error: scopedMutation ? mutation.error : null,
    authPaused:
      !!scopedMutation &&
      mutation.error instanceof InternalApiError &&
      [401, 403].includes(mutation.error.status),
    mutation: guardedMutation,
    retry: () => {
      if (recovery.data) guardedMutation.mutate(recovery.data);
    },
    refreshStorage: () => void recovery.refetch(),
  };
}
