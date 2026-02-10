'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';

interface Props {
  wsId: string;
}

export default function DefaultGroupSettings({ wsId }: Props) {
  const t = useTranslations('settings.user_management');
  const queryClient = useQueryClient();

  const { data: defaultGroupConfig, isLoading: isLoadingConfig } =
    useWorkspaceConfig<string | null>(
      wsId,
      'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
      null
    );

  const { data: groupsData, isLoading: isLoadingGroups } =
    useWorkspaceUserGroups(wsId);

  const isLoading = isLoadingConfig || isLoadingGroups;

  const [initialized, setInitialized] = useState(false);
  const [initialValue, setInitialValue] = useState<string | null>(null);
  const [currentValue, setCurrentValue] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    // Validate stored ID against available groups (stale ID cleanup)
    const availableIds = new Set((groupsData || []).map((g) => g.id));
    const cleanedValue =
      defaultGroupConfig && availableIds.has(defaultGroupConfig)
        ? defaultGroupConfig
        : null;

    setInitialValue(cleanedValue);
    if (!initialized) {
      setCurrentValue(cleanedValue);
      setInitialized(true);
    }
  }, [isLoading, defaultGroupConfig, groupsData, initialized]);

  const updateMutation = useMutation({
    mutationFn: async (value: string | null) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/settings/DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: value ?? '' }),
        }
      );

      if (!res.ok)
        throw new Error(
          'Failed to update DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS'
        );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'workspace-config',
          wsId,
          'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
        ],
      });
      toast.success(t('update_success'));
      setInitialValue(currentValue);
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isDirty = currentValue !== initialValue;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateMutation.mutate(currentValue);
      }}
      className="space-y-4"
    >
      <div className="flex flex-row items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <div className="font-medium text-base">
            {t('default_group_label')}
          </div>
          <div className="text-muted-foreground text-sm">
            {t('default_group_help')}
          </div>
        </div>
        <Select
          value={currentValue ?? 'none'}
          onValueChange={(value) =>
            setCurrentValue(value === 'none' ? null : value)
          }
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t('default_group_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('no_default_group')}</SelectItem>
            {(groupsData || []).map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
                {group.archived ? ' (Archived)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        disabled={isLoading || updateMutation.isPending || !isDirty}
      >
        {updateMutation.isPending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
