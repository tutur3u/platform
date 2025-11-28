'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

interface TaskSettingsData {
  task_auto_assign_to_self: boolean;
}

interface TaskSettingsProps {
  workspace?: Workspace | null;
}

export function TaskSettings({ workspace }: TaskSettingsProps) {
  const t = useTranslations('settings.tasks');
  const queryClient = useQueryClient();
  const isPersonalWorkspace = workspace?.personal ?? false;

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async (): Promise<TaskSettingsData> => {
      const res = await fetch('/api/v1/users/task-settings');
      if (!res.ok) throw new Error('Failed to fetch task settings');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const updateSettings = useMutation({
    mutationFn: async (data: Partial<TaskSettingsData>) => {
      const res = await fetch('/api/v1/users/task-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update task settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-task-settings'] });
      toast.success(t('settings_updated'));
    },
    onError: () => {
      toast.error(t('settings_update_failed'));
    },
  });

  const handleAutoAssignToggle = (checked: boolean) => {
    updateSettings.mutate({ task_auto_assign_to_self: checked });
  };

  // For personal workspaces, always show as ON (it's forced behavior)
  const effectiveValue = isPersonalWorkspace
    ? true
    : (settings?.task_auto_assign_to_self ?? false);

  return (
    <div className="space-y-8">
      <div className="grid gap-6">
        <SettingItemTab
          title={t('auto_assign_to_self')}
          description={
            isPersonalWorkspace
              ? t('always_enabled_personal')
              : t('auto_assign_to_self_description')
          }
        >
          <Switch
            checked={effectiveValue}
            onCheckedChange={handleAutoAssignToggle}
            disabled={
              isLoading || updateSettings.isPending || isPersonalWorkspace
            }
          />
        </SettingItemTab>
        <Separator />
      </div>
    </div>
  );
}
