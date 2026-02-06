'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
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
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Fetch manager user IDs to filter them out of the table
  const { data: managerUserIds = new Set<string>() } = useQuery({
    queryKey: ['groupManagerIds', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_user_groups_users')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('role', 'TEACHER');
      if (error) throw error;
      return new Set(
        (data || []).map((d) => d.user_id).filter(Boolean) as string[]
      );
    },
    staleTime: 5 * 60 * 1000,
  });

  const [pendingValues, setPendingValues] = useState<
    Map<string, PendingIndicatorValue>
  >(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const { data: groupIndicators = initialGroupIndicators } = useQuery({
    queryKey: ['groupIndicators', wsId, groupId],
    queryFn: async (): Promise<GroupIndicator[]> => {
      const { data, error } = await supabase
        .from('healthcare_vitals')
        .select('id, name, factor, unit')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as GroupIndicator[];
    },
    initialData: initialGroupIndicators,
  });

  const { data: userIndicators = initialUserIndicators } = useQuery({
    queryKey: ['userIndicators', wsId, groupId],
    queryFn: async (): Promise<UserIndicator[]> => {
      const { data, error } = await supabase
        .from('user_indicators')
        .select(`
          user_id,
          indicator_id,
          value,
          healthcare_vitals!inner(group_id)
        `)
        .eq('healthcare_vitals.group_id', groupId);

      if (error) throw error;
      return (data || []) as UserIndicator[];
    },
    initialData: initialUserIndicators,
  });

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
      const { data, error } = await supabase
        .from('healthcare_vitals')
        .insert({
          name,
          unit: unit.trim() || '',
          factor,
          ws_id: wsId,
          group_id: groupId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['groupIndicators', wsId, groupId],
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
      const { error } = await supabase
        .from('healthcare_vitals')
        .update({ name, factor, unit })
        .eq('id', indicatorId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['groupIndicators', wsId, groupId],
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
      const { error } = await supabase
        .from('healthcare_vitals')
        .update({ group_id: null })
        .eq('id', indicatorId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['groupIndicators', wsId, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['userIndicators', wsId, groupId],
        }),
      ]);
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
          (ui) =>
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

      const { error } = await supabase.from('user_indicators').upsert(
        values.map(({ user_id, indicator_id, value }) => ({
          user_id,
          indicator_id,
          value,
        }))
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['userIndicators', wsId, groupId],
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
          (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
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
          (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
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
            (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
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
        (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
      );
      return indicator?.value?.toString() || '';
    },
    [pendingValues, userIndicators]
  );

  const calculateAverage = useCallback(
    (userId: string) => {
      const userValues = groupIndicators
        .map((indicator) => {
          const key = `${userId}|${indicator.id}`;
          if (pendingValues.has(key)) {
            return pendingValues.get(key)?.value;
          }
          const userIndicator = userIndicators.find(
            (ui) => ui.user_id === userId && ui.indicator_id === indicator.id
          );
          return userIndicator?.value;
        })
        .filter((value) => value !== null && value !== undefined) as number[];

      if (userValues.length === 0) return '-';
      const avg = userValues.reduce((s, v) => s + v, 0) / userValues.length;
      return avg.toPrecision(2);
    },
    [groupIndicators, pendingValues, userIndicators]
  );

  const canEditCell = useCallback(
    (userId: string, indicatorId: string) => {
      const existing = userIndicators.find(
        (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
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
