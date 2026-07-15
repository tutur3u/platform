'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Label } from '@tuturuuu/ui/label';
import { getTaskApiUrl } from '@tuturuuu/ui/lib/tasks-app-url';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { TASK_SOUND_EFFECTS_ENABLED_CONFIG_ID } from '../../task-sound-effects';

interface TaskSettingsData {
  task_auto_assign_to_self: boolean;
  fade_completed_tasks: boolean;
}

/**
 * Helper function to update the body data attribute for CSS-based fade effect
 */
function updateBodyFadeAttribute(enabled: boolean) {
  if (typeof document !== 'undefined') {
    document.body.setAttribute('data-fade-completed', String(enabled));
  }
}

interface QuickSettingsPopoverProps {
  /** Whether the workspace is personal (forces auto-assign to true) */
  isPersonalWorkspace?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Quick settings popover for task-related preferences.
 * Provides inline access to commonly used settings.
 */
export function QuickSettingsPopover({
  isPersonalWorkspace = false,
  open,
  onOpenChange,
}: QuickSettingsPopoverProps) {
  const t = useTranslations('settings.tasks');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const {
    value: soundEffectsEnabled,
    setValue: setSoundEffectsEnabled,
    isLoading: soundEffectsEnabledLoading,
    isPending: soundEffectsEnabledPending,
  } = useUserBooleanConfig(TASK_SOUND_EFFECTS_ENABLED_CONFIG_ID, true);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async (): Promise<TaskSettingsData> => {
      const res = await fetch(getTaskApiUrl('/api/v1/users/task-settings'), {
        credentials: 'include',
      });
      if (!res.ok) {
        // Return defaults if API fails
        return { task_auto_assign_to_self: false, fade_completed_tasks: false };
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const updateSettings = useMutation({
    mutationFn: async (data: Partial<TaskSettingsData>) => {
      const res = await fetch(getTaskApiUrl('/api/v1/users/task-settings'), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update task settings');
      return res.json() as Promise<TaskSettingsData>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-task-settings'] });
      // Update body attribute immediately on success
      if (data.fade_completed_tasks !== undefined) {
        updateBodyFadeAttribute(data.fade_completed_tasks);
      }
    },
  });

  const handleAutoAssignToggle = (checked: boolean) => {
    updateSettings.mutate({ task_auto_assign_to_self: checked });
  };

  const handleFadeCompletedToggle = (checked: boolean) => {
    // Optimistically update body attribute for instant feedback
    updateBodyFadeAttribute(checked);
    updateSettings.mutate({ fade_completed_tasks: checked });
  };

  const effectiveAutoAssignValue = isPersonalWorkspace
    ? true
    : (settings?.task_auto_assign_to_self ?? false);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="h-7 w-7 p-0"
              disabled={isLoading}
            >
              <Settings className="h-4 w-4" />
              <span className="sr-only">Quick Settings</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Quick Settings</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-72"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium text-sm">{tCommon('quick_settings')}</h4>
            <p className="text-muted-foreground text-xs">
              {t('general_description')}
            </p>
          </div>
          <div className="space-y-3">
            {/* Auto-assign to self */}
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label htmlFor="auto-assign" className="text-sm">
                  {t('auto_assign_to_self')}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {isPersonalWorkspace
                    ? t('always_enabled_personal')
                    : t('auto_assign_to_self_description')}
                </p>
              </div>
              <Switch
                id="auto-assign"
                checked={effectiveAutoAssignValue}
                onCheckedChange={handleAutoAssignToggle}
                disabled={
                  isLoading || updateSettings.isPending || isPersonalWorkspace
                }
              />
            </div>
            {/* Fade completed tasks */}
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label htmlFor="fade-completed" className="text-sm">
                  {t('fade_completed_tasks')}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {t('fade_completed_tasks_description')}
                </p>
              </div>
              <Switch
                id="fade-completed"
                checked={settings?.fade_completed_tasks ?? false}
                onCheckedChange={handleFadeCompletedToggle}
                disabled={isLoading || updateSettings.isPending}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label htmlFor="task-sound-effects" className="text-sm">
                  {t('sound_effects')}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {t('sound_effects_description')}
                </p>
              </div>
              <Switch
                id="task-sound-effects"
                checked={soundEffectsEnabled}
                onCheckedChange={setSoundEffectsEnabled}
                disabled={
                  soundEffectsEnabledLoading || soundEffectsEnabledPending
                }
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
