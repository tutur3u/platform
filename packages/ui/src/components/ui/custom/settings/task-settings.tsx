'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

interface TaskSettingsData {
  task_auto_assign_to_self: boolean;
  fade_completed_tasks: boolean;
}

interface TaskSettingsProps {
  workspace?: Workspace | null;
}

function updateBodyFadeAttribute(enabled: boolean) {
  if (typeof document !== 'undefined') {
    document.body.setAttribute('data-fade-completed', String(enabled));
  }
}

export function TaskSettings({ workspace }: TaskSettingsProps) {
  const t = useTranslations('settings.tasks');
  const queryClient = useQueryClient();
  const isPersonalWorkspace = workspace?.personal ?? false;

  const {
    value: draftModeEnabled,
    setValue: setDraftModeEnabled,
    isLoading: draftModeLoading,
    isPending: draftModePending,
  } = useUserBooleanConfig('TASK_DRAFT_MODE_ENABLED', false);

  const {
    value: expandTunaSections,
    setValue: setExpandTunaSections,
    isLoading: expandTunaSectionsLoading,
    isPending: expandTunaSectionsPending,
  } = useUserBooleanConfig('TUNA_EXPAND_ALL_TASK_SECTIONS', true);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async (): Promise<TaskSettingsData> => {
      const res = await fetch('/api/v1/users/task-settings');
      if (!res.ok) throw new Error('Failed to fetch task settings');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (settings?.fade_completed_tasks !== undefined) {
      updateBodyFadeAttribute(settings.fade_completed_tasks);
    }
  }, [settings?.fade_completed_tasks]);

  const updateSettings = useMutation({
    mutationFn: async (data: Partial<TaskSettingsData>) => {
      const res = await fetch('/api/v1/users/task-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update task settings');
      return res.json() as Promise<TaskSettingsData>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-task-settings'] });
      if (data.fade_completed_tasks !== undefined) {
        updateBodyFadeAttribute(data.fade_completed_tasks);
      }
      toast.success(t('settings_updated'));
    },
    onError: () => {
      toast.error(t('settings_update_failed'));
    },
  });

  const handleAutoAssignToggle = (checked: boolean) => {
    updateSettings.mutate({ task_auto_assign_to_self: checked });
  };

  const handleFadeCompletedToggle = (checked: boolean) => {
    updateBodyFadeAttribute(checked);
    updateSettings.mutate({ fade_completed_tasks: checked });
  };

  const effectiveAutoAssignValue = isPersonalWorkspace
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
            checked={effectiveAutoAssignValue}
            onCheckedChange={handleAutoAssignToggle}
            disabled={
              isLoading || updateSettings.isPending || isPersonalWorkspace
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('fade_completed_tasks')}
          description={t('fade_completed_tasks_description')}
        >
          <Switch
            checked={settings?.fade_completed_tasks ?? false}
            onCheckedChange={handleFadeCompletedToggle}
            disabled={isLoading || updateSettings.isPending}
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('draft_mode')}
          description={t('draft_mode_description')}
        >
          <Switch
            checked={draftModeEnabled}
            onCheckedChange={setDraftModeEnabled}
            disabled={draftModeLoading || draftModePending}
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('expand_tuna_sections')}
          description={t('expand_tuna_sections_description')}
        >
          <Switch
            checked={expandTunaSections}
            onCheckedChange={setExpandTunaSections}
            disabled={expandTunaSectionsLoading || expandTunaSectionsPending}
          />
        </SettingItemTab>
        <Separator />
      </div>
    </div>
  );
}
