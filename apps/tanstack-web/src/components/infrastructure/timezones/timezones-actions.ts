'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BackendInfrastructureTimezoneCreateRequest,
  BackendInfrastructureTimezoneWriteRequest,
} from '@tuturuuu/internal-api/backend';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useMemo } from 'react';
import { useRouter } from '../../../lib/platform/next-navigation-shim';
import { timezonesManagementQueryKey } from './query-keys';
import { toTimezoneMutationPayload } from './timezone-utils';
import type {
  TimezoneManagementLabels,
  TimezoneManagementRow,
  TimezoneMutationPayload,
} from './types';

export type TimezonesActionResult =
  | {
      message: string;
      ok: true;
    }
  | {
      code?: string;
      message: string;
      ok: false;
      status?: number;
    };

type UseTimezonesActionsProps = {
  createTimezone: (
    values: BackendInfrastructureTimezoneCreateRequest
  ) => Promise<TimezonesActionResult>;
  deleteTimezone: (timezoneId: string) => Promise<TimezonesActionResult>;
  labels: TimezoneManagementLabels;
  onCreateSuccess?: () => void;
  updateTimezone: (
    timezoneId: string,
    values: BackendInfrastructureTimezoneWriteRequest
  ) => Promise<TimezonesActionResult>;
  workspaceId: string;
};

function assertActionResult(result: TimezonesActionResult) {
  if (!result.ok) {
    throw new Error(result.message);
  }

  return result;
}

function toBackendCreateRequest(
  payload: TimezoneMutationPayload
): BackendInfrastructureTimezoneCreateRequest {
  return {
    abbr: payload.abbr,
    id: payload.id ?? null,
    isdst: payload.isdst,
    offset: payload.offset,
    text: payload.text,
    utc: payload.utc,
    value: payload.value,
  };
}

function toBackendWriteRequest(
  payload: TimezoneMutationPayload
): BackendInfrastructureTimezoneWriteRequest {
  return {
    abbr: payload.abbr,
    isdst: payload.isdst,
    offset: payload.offset,
    text: payload.text,
    utc: payload.utc,
    value: payload.value,
  };
}

export function useTimezonesActions({
  createTimezone,
  deleteTimezone,
  labels,
  onCreateSuccess,
  updateTimezone,
  workspaceId,
}: UseTimezonesActionsProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const queryKey = useMemo(
    () => timezonesManagementQueryKey(workspaceId),
    [workspaceId]
  );

  const refreshRouteData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
    router.refresh();
  }, [queryClient, queryKey, router]);

  const createMutation = useMutation({
    mutationFn: async (payload: TimezoneMutationPayload) =>
      assertActionResult(await createTimezone(toBackendCreateRequest(payload))),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : labels.toasts.createError
      );
    },
    onSuccess: async (result) => {
      toast.success(result.message || labels.toasts.createSuccess);
      onCreateSuccess?.();
      await refreshRouteData();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: TimezoneMutationPayload;
    }) =>
      assertActionResult(
        await updateTimezone(id, toBackendWriteRequest(payload))
      ),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : labels.toasts.updateError
      );
    },
    onSuccess: async (result) => {
      toast.success(result.message || labels.toasts.updateSuccess);
      await refreshRouteData();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (timezoneId: string) =>
      assertActionResult(await deleteTimezone(timezoneId)),
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : labels.toasts.deleteError
      );
    },
    onSuccess: async (result) => {
      toast.success(result.message || labels.toasts.deleteSuccess);
      await refreshRouteData();
    },
  });

  const handleCreate = useCallback(
    async (payload: TimezoneMutationPayload) => {
      await createMutation.mutateAsync(payload);
    },
    [createMutation]
  );

  const handleSync = useCallback(
    async (row: TimezoneManagementRow) => {
      const payload = toTimezoneMutationPayload(row);

      if (row.id) {
        await updateMutation.mutateAsync({ id: row.id, payload });
        return;
      }

      await createMutation.mutateAsync({
        ...payload,
        status: 'pending',
      });
    },
    [createMutation, updateMutation]
  );

  const handleUpdate = useCallback(
    async (row: TimezoneManagementRow, payload: TimezoneMutationPayload) => {
      if (!row.id) {
        await createMutation.mutateAsync(payload);
        return;
      }

      await updateMutation.mutateAsync({ id: row.id, payload });
    },
    [createMutation, updateMutation]
  );

  const handleDelete = useCallback(
    async (row: TimezoneManagementRow) => {
      if (!row.id) return;

      await deleteMutation.mutateAsync(row.id);
    },
    [deleteMutation]
  );

  return {
    createPending: createMutation.isPending,
    handleCreate,
    handleDelete,
    handleSync,
    handleUpdate,
    isMutating:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
    refreshRouteData,
  };
}
