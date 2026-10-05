'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CalendarProviderSeriesOperationPayload,
  type CalendarProviderSeriesOperationResult,
  getCalendarProviderSeriesOperation,
  reserveCalendarProviderSeriesOperation,
  retryCalendarProviderSeriesOperation,
} from '@tuturuuu/internal-api/calendar-provider-series';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { useEffect, useMemo } from 'react';
import type { useWorkspaceActor } from '../../../../hooks/use-workspace-visibility';

type Pending = {
  operationId: string;
  payload?: CalendarProviderSeriesOperationPayload;
  confirmed: boolean;
};
/** Retained within the actor-scoped query cache so dismissing a pending dialog cannot create another intent. */
export function useProviderRecurrenceOperation({
  wsId,
  actor,
  identity,
  onApplied,
}: {
  wsId: string;
  actor: NonNullable<ReturnType<typeof useWorkspaceActor>>;
  identity: string;
  onApplied: () => void;
}) {
  const client = useQueryClient();
  const key = useMemo(
    () => ['calendar-provider-pending', wsId, actor.actorId, identity],
    [wsId, actor.actorId, identity]
  );
  const storageKey = `calendar-provider-operation:${wsId}:${actor.actorId}:${identity}`;
  const retained = useQuery<Pending | null>({
    queryKey: key,
    queryFn: () => null,
    enabled: false,
    initialData: () => {
      try {
        const id = sessionStorage.getItem(storageKey);
        return id && /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(id)
          ? { operationId: id, confirmed: true }
          : null;
      } catch {
        return null;
      }
    },
    gcTime: Infinity,
  });
  const pending = retained.data;
  const status = useQuery({
    queryKey: [
      'calendar-provider-operation',
      wsId,
      actor.actorId,
      pending?.operationId,
    ],
    enabled: !!pending,
    queryFn: async ({ signal }) => {
      actor.assertActive();
      const value = await getCalendarProviderSeriesOperation(
        wsId,
        pending!.operationId,
        { signal }
      );
      actor.assertActive();
      return value;
    },
    retry: false,
    refetchInterval: (query) => {
      if (query.state.data?.status === 'applied') return false;
      const error = query.state.error;
      if (
        error instanceof InternalApiError &&
        [401, 403, 404, 409, 422, 429].includes(error.status)
      )
        return false;
      // Network/server failures need an explicit retry, not a repeated request storm.
      return error ? false : 2000;
    },
  });
  const submission = useMutation({
    mutationFn: async (payload?: CalendarProviderSeriesOperationPayload) => {
      actor.assertActive();
      const current = client.getQueryData<Pending | null>(key);
      const intent = current?.payload ?? payload;
      const operationId = current?.operationId ?? intent?.requestId;
      if (!operationId) throw new Error('No provider operation');
      // UUID only: preserve recovery across reloads without storing event content or credentials.
      // If storage is unavailable, fail before admitting a request that cannot be recovered.
      sessionStorage.setItem(storageKey, operationId);
      // Retain before sending: a failed response may follow a successful remote reservation.
      client.setQueryData<Pending>(key, {
        operationId,
        payload: intent,
        confirmed: current?.confirmed ?? false,
      });
      let value: CalendarProviderSeriesOperationResult;
      try {
        value =
          current?.confirmed || !intent
            ? await retryCalendarProviderSeriesOperation(wsId, operationId)
            : await reserveCalendarProviderSeriesOperation(wsId, intent);
      } catch (error) {
        // Only a completed rejection plus authoritative absence can release an intent.
        // Transport errors retain it because the server may already have reserved it.
        if (
          !current?.confirmed &&
          error instanceof InternalApiError &&
          [400, 403, 404, 409, 422].includes(error.status)
        ) {
          try {
            await getCalendarProviderSeriesOperation(wsId, operationId);
          } catch (lookupError) {
            actor.assertActive();
            if (
              lookupError instanceof InternalApiError &&
              lookupError.status === 404
            ) {
              sessionStorage.removeItem(storageKey);
              client.setQueryData(key, null);
            }
          }
        }
        throw error;
      }
      actor.assertActive();
      const operationKey = [
        'calendar-provider-operation',
        wsId,
        actor.actorId,
        operationId,
      ];
      const observed =
        client.getQueryData<CalendarProviderSeriesOperationResult>(
          operationKey
        );
      if (
        observed?.status === 'applied' &&
        observed.operationId === operationId
      )
        return observed;
      client.setQueryData<Pending>(key, {
        operationId,
        payload: intent,
        confirmed: true,
      });
      client.setQueryData<CalendarProviderSeriesOperationResult>(
        ['calendar-provider-operation', wsId, actor.actorId, operationId],
        value
      );
      return value;
    },
  });
  const receipt =
    status.data?.status === 'applied' ? status.data : submission.data;
  const applied =
    !!pending &&
    receipt?.status === 'applied' &&
    receipt.operationId === pending.operationId;
  useEffect(() => {
    if (!applied) return;
    try {
      actor.assertActive();
    } catch {
      return;
    }
    if (!client.getQueryData<Pending | null>(key)) return;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* An applied UUID is safe to recover again. */
    }
    client.setQueryData(key, null);
    onApplied();
  }, [applied, actor, client, key, storageKey, onApplied]);
  return {
    pending: !!pending,
    submission,
    status,
    retry: () => submission.mutate(undefined),
  };
}
