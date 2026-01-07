'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

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
}

/**
 * Quick settings popover for task-related preferences.
 * Provides inline access to commonly used settings.
 */
export function QuickSettingsPopover({
  isPersonalWorkspace = false,
}: QuickSettingsPopoverProps) {
  const t = useTranslations('settings.tasks');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async (): Promise<TaskSettingsData> => {
      const res = await fetch('/api/v1/users/task-settings');
      if (!res.ok) {
        // Return defaults if API fails
        return { task_auto_assign_to_self: false, fade_completed_tasks: false };
      }
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
    <Popover>
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
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
