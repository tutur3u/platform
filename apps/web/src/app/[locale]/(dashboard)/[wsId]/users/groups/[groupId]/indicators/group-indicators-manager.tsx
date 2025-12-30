'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Save, Trash2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import UserFeedbackDialog from './user-feedback-dialog';

interface GroupIndicator {
  id: string;
  name: string;
  factor: number;
  unit: string;
}

interface UserIndicator {
  user_id: string;
  indicator_id: string;
  value: number | null;
}

interface PendingIndicatorValue {
  user_id: string;
  indicator_id: string;
  value: number | null;
}

interface Props {
  wsId: string;
  groupId: string;
  groupName: string;
  users: WorkspaceUser[];
  initialGroupIndicators: GroupIndicator[];
  initialUserIndicators: UserIndicator[];
  canCreateUserGroupsScores: boolean;
  canUpdateUserGroupsScores: boolean;
  canDeleteUserGroupsScores: boolean;
}

export default function GroupIndicatorsManager({
  wsId,
  groupId,
  groupName,
  users,
  initialGroupIndicators,
  initialUserIndicators,
  canCreateUserGroupsScores = false,
  canUpdateUserGroupsScores = false,
  canDeleteUserGroupsScores = false,
}: Props) {
  const t = useTranslations();
  const tIndicators = useTranslations('ws-user-group-indicators');
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedIndicator, setSelectedIndicator] =
    useState<GroupIndicator | null>(null);
  const [selectedUser, setSelectedUser] = useState<WorkspaceUser | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    factor: 1,
    unit: '',
  });

  // Add indicator form states
  const [newVitalForm, setNewVitalForm] = useState({
    name: '',
    unit: '',
    factor: 1,
  });

  // Dirty changes tracking
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
  const addIndicatorMutation = useMutation({
    mutationFn: async (vitalId: string) => {
      const { error } = await supabase
        .from('healthcare_vitals')
        .update({ group_id: groupId })
        .eq('id', vitalId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['groupIndicators', wsId, groupId],
        }),
      ]);
      toast.success(tIndicators('indicator_added_successfully'));
    },
    onError: (error) => {
      console.error('Error adding indicator:', error);
      toast.error(tIndicators('failed_to_add_indicator'));
    },
  });

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
      const insertData = {
        name,
        unit: unit.trim() || '',
        factor,
        ws_id: wsId,
        group_id: groupId,
      };

      const { data, error } = await supabase
        .from('healthcare_vitals')
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['groupIndicators', wsId, groupId],
        }),
      ]);
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
    mutationFn: async (pendingValues: PendingIndicatorValue[]) => {
      // Check permissions based on operation type
      for (const pendingValue of pendingValues) {
        const existingIndicator = userIndicators.find(
          (ui) =>
            ui.user_id === pendingValue.user_id &&
            ui.indicator_id === pendingValue.indicator_id
        );

        if (pendingValue.value === null) {
          // Deleting a value (setting to null)
          if (!canDeleteUserGroupsScores) {
            throw new Error(
              'Permission denied: cannot delete indicator values'
            );
          }
        } else if (!existingIndicator || existingIndicator.value === null) {
          // Creating a new value (no existing record or existing value is null)
          if (!canCreateUserGroupsScores) {
            throw new Error(
              'Permission denied: cannot create indicator values'
            );
          }
        } else {
          // Updating an existing value
          if (!canUpdateUserGroupsScores) {
            throw new Error(
              'Permission denied: cannot update indicator values'
            );
          }
        }
      }

      const { error } = await supabase.from('user_indicators').upsert(
        pendingValues.map(({ user_id, indicator_id, value }) => ({
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
    onError: (error: any) => {
      console.error(
        'Error updating indicator values:',
        error instanceof Error ? error.message : error
      );
      toast.error(tIndicators('failed_to_update_values'));
    },
  });

  const addIndicator = async () => {
    if (!newVitalForm.name.trim()) return;
    await createVitalMutation.mutateAsync({
      name: newVitalForm.name.trim(),
      unit: newVitalForm.unit.trim(),
      factor: newVitalForm.factor,
    });
    setAddDialogOpen(false);
    setNewVitalForm({ name: '', unit: '', factor: 1 });
  };

  const openEditDialog = (indicator: GroupIndicator) => {
    setSelectedIndicator(indicator);
    setEditFormData({
      name: indicator.name,
      factor: indicator.factor,
      unit: indicator.unit,
    });
    setEditDialogOpen(true);
  };

  const updateIndicator = async () => {
    if (!selectedIndicator) return;
    await updateIndicatorMutation.mutateAsync({
      indicatorId: selectedIndicator.id,
      name: editFormData.name,
      factor: editFormData.factor,
      unit: editFormData.unit,
    });
    setEditDialogOpen(false);
    setSelectedIndicator(null);
  };

  const deleteIndicator = async () => {
    if (!selectedIndicator) return;
    await deleteIndicatorMutation.mutateAsync(selectedIndicator.id);
    setDeleteDialogOpen(false);
    setSelectedIndicator(null);
  };

  const openFeedbackDialog = (user: WorkspaceUser) => {
    setSelectedUser(user);
    setFeedbackDialogOpen(true);
  };

  // Handle indicator value changes (local state only)
  const handleIndicatorValueChange = useCallback(
    (userId: string, indicatorId: string, value: string) => {
      const numericValue = value === '' ? null : parseFloat(value);
      const key = `${userId}|${indicatorId}`;

      // Check permissions based on operation type
      if (numericValue === null) {
        // Checking if user is trying to delete a value
        const originalIndicator = userIndicators.find(
          (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
        );
        if (
          originalIndicator?.value !== null &&
          originalIndicator?.value !== undefined
        ) {
          // User is clearing a value that existed, so this is a deletion
          if (!canDeleteUserGroupsScores) {
            toast.error(t('common.insufficient_permissions'));
            return;
          }
        }
      } else {
        // User is setting a value
        const existingIndicator = userIndicators.find(
          (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
        );

        if (!existingIndicator || existingIndicator.value === null) {
          // Creating a new value (no existing record or existing value is null)
          if (!canCreateUserGroupsScores) {
            toast.error(t('common.insufficient_permissions'));
            return;
          }
        } else {
          // Updating an existing value
          if (!canUpdateUserGroupsScores) {
            toast.error(t('common.insufficient_permissions'));
            return;
          }
        }
      }

      setPendingValues((prev) => {
        const newMap = new Map(prev);
        if (numericValue === null) {
          // Check if there was an original value - if so, we need to track the deletion
          const originalIndicator = userIndicators.find(
            (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
          );
          if (
            originalIndicator?.value !== null &&
            originalIndicator?.value !== undefined
          ) {
            // User is clearing a value that existed, so we track this as a deletion
            newMap.set(key, {
              user_id: userId,
              indicator_id: indicatorId,
              value: null,
            });
          } else {
            // No original value, so we can just remove from pending
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
    [
      userIndicators,
      canCreateUserGroupsScores,
      canUpdateUserGroupsScores,
      canDeleteUserGroupsScores,
      t,
    ]
  );

  // Check if a value is pending (different from original)
  const isValuePending = useCallback(
    (userId: string, indicatorId: string) => {
      const key = `${userId}|${indicatorId}`;
      return pendingValues.has(key);
    },
    [pendingValues]
  );

  // Reset all pending changes
  const handleReset = useCallback(() => {
    setPendingValues(new Map());
  }, []);

  // Submit all pending changes
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

  const getIndicatorValue = useCallback(
    (userId: string, indicatorId: string) => {
      const key = `${userId}|${indicatorId}`;

      // Check if there's a pending value first
      if (pendingValues.has(key)) {
        const pendingValue = pendingValues.get(key)?.value;
        // If pending value is null, it means user explicitly cleared it
        return pendingValue === null ? '' : pendingValue?.toString() || '';
      }

      // Fall back to original value
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

          // Check if there's a pending value first
          if (pendingValues.has(key)) {
            return pendingValues.get(key)?.value;
          }

          // Fall back to original value
          const userIndicator = userIndicators.find(
            (ui) => ui.user_id === userId && ui.indicator_id === indicator.id
          );
          return userIndicator?.value;
        })
        .filter((value) => value !== null && value !== undefined) as number[];

      if (userValues.length === 0) return '-';

      const average =
        userValues.reduce((sum, value) => sum + value, 0) / userValues.length;
      return average.toPrecision(2);
    },
    [groupIndicators, pendingValues, userIndicators]
  );

  const isAnyMutationPending =
    addIndicatorMutation.isPending ||
    createVitalMutation.isPending ||
    updateIndicatorMutation.isPending ||
    deleteIndicatorMutation.isPending ||
    updateUserIndicatorValueMutation.isPending ||
    isSubmitting;

  const hasChanges = pendingValues.size > 0;

  const canEditCell = useCallback(
    (userId: string, indicatorId: string) => {
      const existing = userIndicators.find(
        (ui) => ui.user_id === userId && ui.indicator_id === indicatorId
      );
      if (!existing || existing.value == null) return canCreateUserGroupsScores;
      return canUpdateUserGroupsScores || canDeleteUserGroupsScores; // allow edit if they can change or clear
    },
    [
      userIndicators,
      canCreateUserGroupsScores,
      canUpdateUserGroupsScores,
      canDeleteUserGroupsScores,
    ]
  );

  return (
    <div>
      <StickyBottomBar
        show={hasChanges}
        message={t('common.unsaved-changes')}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={isAnyMutationPending}
            >
              <RotateCcw className="h-4 w-4" />
              {t('common.reset')}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isAnyMutationPending}
              className={cn(
                'border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
              )}
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {/* Add Indicator Button */}
        {canCreateUserGroupsScores && (
          <div className="flex justify-end">
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {tIndicators('add_indicator')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{tIndicators('add_indicator')}</DialogTitle>
                  <DialogDescription>
                    {tIndicators('add_indicator_description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-vital-name">
                        {tIndicators('indicator_name')}
                      </Label>
                      <Input
                        id="new-vital-name"
                        value={newVitalForm.name}
                        onChange={(e) =>
                          setNewVitalForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder={tIndicators('indicator_name_placeholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-vital-unit">
                        {tIndicators('unit')}
                      </Label>
                      <Input
                        id="new-vital-unit"
                        value={newVitalForm.unit}
                        onChange={(e) =>
                          setNewVitalForm((prev) => ({
                            ...prev,
                            unit: e.target.value,
                          }))
                        }
                        placeholder={tIndicators('unit_placeholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-vital-factor">
                        {tIndicators('factor')}
                      </Label>
                      <Input
                        id="new-vital-factor"
                        type="number"
                        step="0.01"
                        value={newVitalForm.factor}
                        onChange={(e) =>
                          setNewVitalForm((prev) => ({
                            ...prev,
                            factor: parseFloat(e.target.value) || 1,
                          }))
                        }
                        placeholder={tIndicators('factor_placeholder')}
                      />
                      <p className="text-muted-foreground text-sm">
                        {tIndicators('factor_description')}
                      </p>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAddDialogOpen(false);
                      setSelectedIndicator(null);
                      setNewVitalForm({ name: '', unit: '', factor: 1 });
                    }}
                    disabled={isAnyMutationPending}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={addIndicator}
                    disabled={isAnyMutationPending || !newVitalForm.name.trim()}
                  >
                    {addIndicatorMutation.isPending ||
                    createVitalMutation.isPending
                      ? tIndicators('adding')
                      : tIndicators('add_indicator')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Edit Indicator Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tIndicators('edit_indicator')}</DialogTitle>
              <DialogDescription>
                {tIndicators('edit_indicator_description')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="indicator-name">
                  {tIndicators('indicator_name')}
                </Label>
                <Input
                  id="indicator-name"
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder={tIndicators('indicator_name_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="indicator-factor">
                  {tIndicators('factor')}
                </Label>
                <Input
                  id="indicator-factor"
                  type="number"
                  step="0.01"
                  value={editFormData.factor}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      factor: parseFloat(e.target.value) || 1,
                    }))
                  }
                  placeholder={tIndicators('factor_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="indicator-unit">{tIndicators('unit')}</Label>
                <Input
                  id="indicator-unit"
                  value={editFormData.unit}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      unit: e.target.value,
                    }))
                  }
                  placeholder={tIndicators('unit_placeholder')}
                />
              </div>
            </div>
            <DialogFooter className="flex justify-between">
              {canDeleteUserGroupsScores && (
                <AlertDialog
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={isAnyMutationPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {tIndicators('remove_indicator')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {selectedIndicator?.name
                          ? tIndicators('remove_indicator_description', {
                              indicatorName: selectedIndicator.name,
                            })
                          : tIndicators('remove_indicator_description', {
                              indicatorName: '',
                            })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isAnyMutationPending}>
                        {t('common.cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={deleteIndicator}
                        disabled={isAnyMutationPending}
                        className="bg-dynamic-red/60 hover:bg-dynamic-red/70"
                      >
                        {deleteIndicatorMutation.isPending
                          ? tIndicators('removing')
                          : t('common.remove')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  disabled={isAnyMutationPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={updateIndicator}
                  disabled={isAnyMutationPending || !editFormData.name.trim()}
                >
                  {updateIndicatorMutation.isPending
                    ? tIndicators('updating')
                    : t('common.save')}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Indicators Table */}
        <div className="overflow-x-auto rounded-lg border">
          <div className="relative">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-background">
                  <th className="sticky left-0 z-20 border-r bg-background px-4 py-2 text-center font-semibold">
                    #
                  </th>
                  <th className="sticky left-12 z-20 min-w-[200px] border-r bg-background px-4 py-2 font-semibold">
                    {t('ws-users.full_name')}
                  </th>
                  {groupIndicators.map((indicator) => (
                    <th
                      key={indicator.id}
                      className="min-w-[120px] border-r px-4 py-2 font-semibold"
                    >
                      {canUpdateUserGroupsScores ? (
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1 text-center hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
                          onClick={() => openEditDialog(indicator)}
                        >
                          <span className="line-clamp-2 text-balance break-all">
                            {indicator.name}
                          </span>
                        </button>
                      ) : (
                        <span className="line-clamp-2 text-balance break-all">
                          {indicator.name}
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 min-w-[100px] border-l bg-background px-4 py-2 font-semibold">
                    {t('common.average')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr key={user.id} className="border-b hover:bg-muted/50">
                    <td className="sticky left-0 z-10 border-r bg-background px-4 py-2 text-center">
                      {index + 1}
                    </td>
                    <td className="sticky left-12 z-10 border-r bg-background px-4 py-2">
                      <button
                        type="button"
                        onClick={() => openFeedbackDialog(user)}
                        className="w-full rounded px-2 py-1 text-left transition-colors hover:bg-dynamic-blue/10 hover:text-dynamic-blue"
                      >
                        <span className="line-clamp-1 break-all">
                          {user.full_name}
                        </span>
                      </button>
                    </td>
                    {groupIndicators.map((indicator) => (
                      <td
                        key={indicator.id}
                        className="border-r px-4 py-2 text-center"
                      >
                        <Input
                          type="number"
                          step="0.01"
                          value={getIndicatorValue(user.id, indicator.id)}
                          onChange={(e) =>
                            handleIndicatorValueChange(
                              user.id,
                              indicator.id,
                              e.target.value
                            )
                          }
                          disabled={!canEditCell(user.id, indicator.id)}
                          aria-readonly={!canEditCell(user.id, indicator.id)}
                          className={cn(
                            'h-8 w-20 text-center',
                            isValuePending(user.id, indicator.id) &&
                              'border-dynamic-blue/50 bg-dynamic-blue/5',
                            !canEditCell(user.id, indicator.id) &&
                              'cursor-not-allowed'
                          )}
                          placeholder="-"
                        />
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 border-l bg-background px-4 py-2 text-center">
                      <span className="font-medium">
                        {calculateAverage(user.id)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {groupIndicators.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            <p>{tIndicators('no_indicators')}</p>
            <p className="text-sm">
              {tIndicators('no_indicators_description')}
            </p>
          </div>
        )}
      </div>

      {/* User Feedback Dialog */}
      <UserFeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        user={selectedUser}
        groupName={groupName}
        wsId={wsId}
        groupId={groupId}
      />
    </div>
  );
}
