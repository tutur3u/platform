'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type {
  GroupIndicator,
  PendingIndicatorValue,
  UserIndicator,
} from './types';

interface UseIndicatorsParams {
  wsId: string;
  groupId: string;
  initialGroupIndicators: GroupIndicator[];
  initialUserIndicators: UserIndicator[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function useIndicators({
  wsId,
  groupId,
  initialGroupIndicators,
  initialUserIndicators,
  canCreate,
  canUpdate,
  canDelete,
}: UseIndicatorsParams) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const queryClient = useQueryClient();

  const [pendingValues, setPendingValues] = useState<
    Map<string, PendingIndicatorValue>
  >(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Consolidated Query
  const indicatorsQuery = useQuery({
    queryKey: ['group-indicators-data', wsId, groupId],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/indicators`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch indicators data');
      return await res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const groupIndicators =
    indicatorsQuery.data?.groupIndicators || initialGroupIndicators;
  const userIndicators =
    indicatorsQuery.data?.userIndicators || initialUserIndicators;
  const managerUserIds = new Set<string>(
    indicatorsQuery.data?.managerUserIds || []
  );

  // Mutations
  const createVitalMutation = useMutation({
    mutationFn: async ({
      name,
      unit,
      factor,
    }: {
      name: string;
      unit: string;
      factor: number;
    }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/indicators`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, unit, factor }),
        }
      );
      if (!res.ok) throw new Error('Failed to create indicator');
      return await res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['group-indicators-data', wsId, groupId],
      });
      toast.success(tIndicators('indicator_created_successfully'));
    },
    onError: (error) => {
      console.error('Error creating indicator:', error);
      toast.error(tIndicators('failed_to_create_indicator'));
    },
  });

  const updateIndicatorMutation = useMutation({
    mutationFn: async ({
      indicatorId,
      name,
      factor,
      unit,
    }: {
      indicatorId: string;
      name: string;
      factor: number;
      unit: string;
    }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/indicators/${indicatorId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, factor, unit }),
        }
      );
      if (!res.ok) throw new Error('Failed to update indicator');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['group-indicators-data', wsId, groupId],
      });
      toast.success(tIndicators('indicator_updated_successfully'));
    },
    onError: (error) => {
      console.error('Error updating indicator:', error);
      toast.error(tIndicators('failed_to_update_indicator'));
    },
  });

  const deleteIndicatorMutation = useMutation({
    mutationFn: async (indicatorId: string) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/indicators/${indicatorId}`,
        {
          method: 'DELETE',
        }
      );
      if (!res.ok) throw new Error('Failed to delete indicator');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['group-indicators-data', wsId, groupId],
      });
      toast.success(tIndicators('indicator_removed_successfully'));
    },
    onError: (error) => {
      console.error('Error deleting indicator:', error);
      toast.error(tIndicators('failed_to_remove_indicator'));
    },
  });

  const updateUserIndicatorValueMutation = useMutation({
    mutationFn: async (values: PendingIndicatorValue[]) => {
      for (const pendingValue of values) {
        const existingIndicator = userIndicators.find(
          (ui: UserIndicator) =>
            ui.user_id === pendingValue.user_id &&
            ui.indicator_id === pendingValue.indicator_id
        );

        if (pendingValue.value === null) {
          if (!canDelete) {
            throw new Error(
              'Permission denied: cannot delete indicator values'
            );
          }
        } else if (!existingIndicator || existingIndicator.value === null) {
          if (!canCreate) {
            throw new Error(
              'Permission denied: cannot create indicator values'
            );
          }
        } else {
          if (!canUpdate) {
            throw new Error(
              'Permission denied: cannot update indicator values'
            );
          }
        }
      }

      const res = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/indicators`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        }
      );
      if (!res.ok) throw new Error('Failed to update indicator values');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['group-indicators-data', wsId, groupId],
      });
      setPendingValues(new Map());
      toast.success(tIndicators('values_updated_successfully'));
    },
    onError: (error: unknown) => {
      console.error(
        'Error updating indicator values:',
        error instanceof Error ? error.message : error
      );
      toast.error(tIndicators('failed_to_update_values'));
    },
  });

  // Value tracking
  const handleValueChange = useCallback(
    (userId: string, indicatorId: string, value: string) => {
      const numericValue = value === '' ? null : parseFloat(value);
      const key = `${userId}|${indicatorId}`;

      if (numericValue === null) {
        const originalIndicator = userIndicators.find(
          (ui: UserIndicator) =>
            ui.user_id === userId && ui.indicator_id === indicatorId
        );
        if (
          originalIndicator?.value !== null &&
          originalIndicator?.value !== undefined
        ) {
          if (!canDelete) {
            toast.error(t('common.insufficient_permissions'));
            return;
          }
        }
      } else {
        const existingIndicator = userIndicators.find(
          (ui: UserIndicator) =>
            ui.user_id === userId && ui.indicator_id === indicatorId
        );
        if (!existingIndicator || existingIndicator.value === null) {
          if (!canCreate) {
            toast.error(t('common.insufficient_permissions'));
            return;
          }
        } else {
          if (!canUpdate) {
            toast.error(t('common.insufficient_permissions'));
            return;
          }
        }
      }

      setPendingValues((prev) => {
        const newMap = new Map(prev);
        if (numericValue === null) {
          const originalIndicator = userIndicators.find(
            (ui: UserIndicator) =>
              ui.user_id === userId && ui.indicator_id === indicatorId
          );
          if (
            originalIndicator?.value !== null &&
            originalIndicator?.value !== undefined
          ) {
            newMap.set(key, {
              user_id: userId,
              indicator_id: indicatorId,
              value: null,
            });
          } else {
            newMap.delete(key);
          }
        } else {
          newMap.set(key, {
            user_id: userId,
            indicator_id: indicatorId,
            value: numericValue,
          });
        }
        return newMap;
      });
    },
    [userIndicators, canCreate, canUpdate, canDelete, t]
  );

  const isValuePending = useCallback(
    (userId: string, indicatorId: string) => {
      return pendingValues.has(`${userId}|${indicatorId}`);
    },
    [pendingValues]
  );

  const getIndicatorValue = useCallback(
    (userId: string, indicatorId: string) => {
      const key = `${userId}|${indicatorId}`;
      if (pendingValues.has(key)) {
        const pendingValue = pendingValues.get(key)?.value;
        return pendingValue === null ? '' : pendingValue?.toString() || '';
      }
      const indicator = userIndicators.find(
        (ui: UserIndicator) =>
          ui.user_id === userId && ui.indicator_id === indicatorId
      );
      return indicator?.value?.toString() || '';
    },
    [pendingValues, userIndicators]
  );
  const calculateAverage = useCallback(
    (userId: string) => {
      const userValues = groupIndicators
        .map((indicator: GroupIndicator) => {
          const key = `${userId}|${indicator.id}`;
          if (pendingValues.has(key)) {
            return pendingValues.get(key)?.value;
          }
          const userIndicator = userIndicators.find(
            (ui: UserIndicator) =>
              ui.user_id === userId && ui.indicator_id === indicator.id
          );
          return userIndicator?.value;
        })
        .filter(
          (value: number | null): value is number =>
            value !== null && value !== undefined
        );

      if (userValues.length === 0) return '-';
      const avg =
        userValues.reduce((s: number, v: number) => s + v, 0) /
        userValues.length;

      return avg.toPrecision(2);
    },
    [groupIndicators, pendingValues, userIndicators]
  );

  const canEditCell = useCallback(
    (userId: string, indicatorId: string) => {
      const existing = userIndicators.find(
        (ui: UserIndicator) =>
          ui.user_id === userId && ui.indicator_id === indicatorId
      );
      if (!existing || existing.value == null) return canCreate;
      return canUpdate || canDelete;
    },
    [userIndicators, canCreate, canUpdate, canDelete]
  );

  const handleReset = useCallback(() => {
    setPendingValues(new Map());
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pendingValues.size === 0) {
      toast.info(t('common.no_changes_to_save'));
      return;
    }
    setIsSubmitting(true);
    try {
      await updateUserIndicatorValueMutation.mutateAsync(
        Array.from(pendingValues.values())
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingValues, updateUserIndicatorValueMutation, t]);

  const hasChanges = pendingValues.size > 0;

  const isAnyMutationPending =
    createVitalMutation.isPending ||
    updateIndicatorMutation.isPending ||
    deleteIndicatorMutation.isPending ||
    updateUserIndicatorValueMutation.isPending ||
    isSubmitting;

  return {
    // Data
    groupIndicators,
    userIndicators,
    managerUserIds,
    // Mutations
    createVitalMutation,
    updateIndicatorMutation,
    deleteIndicatorMutation,
    // Value tracking
    pendingValues,
    handleValueChange,
    isValuePending,
    getIndicatorValue,
    // Computed
    calculateAverage,
    canEditCell,
    hasChanges,
    isAnyMutationPending,
    isSubmitting,
    // Actions
    handleReset,
    handleSubmit,
  };
}
