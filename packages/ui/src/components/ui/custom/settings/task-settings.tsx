'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TASK_NAVIGATION_GOALS_CONFIG_ID,
  TASK_NAVIGATION_IMPORT_CONFIG_ID,
  TASK_NAVIGATION_LEADERBOARDS_CONFIG_ID,
  TASK_NAVIGATION_PROGRESS_CONFIG_ID,
  TASK_NAVIGATION_STATS_CONFIG_ID,
  TASK_QUICK_CREATE_TARGET_LIST_CONFIG_ID,
} from '@tuturuuu/internal-api/users';
import type { Workspace } from '@tuturuuu/types';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  useUpdateUserConfig,
  useUserBooleanConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { getTaskApiUrl } from '../../../../lib/tasks-app-url';
import {
  normalizeTaskDialogPresentation,
  TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
  type TaskDialogPresentation,
} from '../../tu-do/shared/task-dialog-presentation';
import { TASKS_SHOW_REVIEW_DUE_DATES_CONFIG_ID } from '../../tu-do/shared/task-due-date-visibility';
import {
  DEFAULT_TASK_QUICK_CREATE_TARGET_LIST,
  normalizeTaskQuickCreateTargetList,
  type TaskQuickCreateTargetList,
} from '../../tu-do/shared/task-quick-create-target-list';
import {
  clampTaskSoundEffectsVolume,
  DEFAULT_TASK_SOUND_EFFECTS_VOLUME,
  TASK_SOUND_EFFECTS_ENABLED_CONFIG_ID,
  TASK_SOUND_EFFECTS_VOLUME_CONFIG_ID,
} from '../../tu-do/shared/task-sound-effects';

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
    value: expandMiraSections,
    setValue: setExpandMiraSections,
    isLoading: expandMiraSectionsLoading,
    isPending: expandMiraSectionsPending,
  } = useUserBooleanConfig('MIRA_EXPAND_ALL_TASK_SECTIONS', true);

  const {
    value: forceDefaultWsRedirect,
    setValue: setForceDefaultWsRedirect,
    isLoading: forceDefaultWsRedirectLoading,
    isPending: forceDefaultWsRedirectPending,
  } = useUserBooleanConfig('TASKS_FORCE_DEFAULT_WORKSPACE_REDIRECT', false);
  const {
    value: openDefaultBoard,
    setValue: setOpenDefaultBoard,
    isLoading: openDefaultBoardLoading,
    isPending: openDefaultBoardPending,
  } = useUserBooleanConfig('TASKS_OPEN_DEFAULT_BOARD', true);
  const {
    value: showReviewDueDates,
    setValue: setShowReviewDueDates,
    isLoading: showReviewDueDatesLoading,
    isPending: showReviewDueDatesPending,
  } = useUserBooleanConfig(TASKS_SHOW_REVIEW_DUE_DATES_CONFIG_ID, false);
  const {
    value: showTaskProgressNavigation,
    setValue: setShowTaskProgressNavigation,
    isLoading: showTaskProgressNavigationLoading,
    isPending: showTaskProgressNavigationPending,
  } = useUserBooleanConfig(TASK_NAVIGATION_PROGRESS_CONFIG_ID, false);
  const {
    value: showTaskGoalsNavigation,
    setValue: setShowTaskGoalsNavigation,
    isLoading: showTaskGoalsNavigationLoading,
    isPending: showTaskGoalsNavigationPending,
  } = useUserBooleanConfig(TASK_NAVIGATION_GOALS_CONFIG_ID, false);
  const {
    value: showTaskStatsNavigation,
    setValue: setShowTaskStatsNavigation,
    isLoading: showTaskStatsNavigationLoading,
    isPending: showTaskStatsNavigationPending,
  } = useUserBooleanConfig(TASK_NAVIGATION_STATS_CONFIG_ID, false);
  const {
    value: showTaskLeaderboardsNavigation,
    setValue: setShowTaskLeaderboardsNavigation,
    isLoading: showTaskLeaderboardsNavigationLoading,
    isPending: showTaskLeaderboardsNavigationPending,
  } = useUserBooleanConfig(TASK_NAVIGATION_LEADERBOARDS_CONFIG_ID, false);
  const {
    value: showTaskImportNavigation,
    setValue: setShowTaskImportNavigation,
    isLoading: showTaskImportNavigationLoading,
    isPending: showTaskImportNavigationPending,
  } = useUserBooleanConfig(TASK_NAVIGATION_IMPORT_CONFIG_ID, false);
  const {
    value: soundEffectsEnabled,
    setValue: setSoundEffectsEnabled,
    isLoading: soundEffectsEnabledLoading,
    isPending: soundEffectsEnabledPending,
  } = useUserBooleanConfig(TASK_SOUND_EFFECTS_ENABLED_CONFIG_ID, true);
  const { data: soundEffectsVolume, isLoading: soundEffectsVolumeLoading } =
    useUserConfig(
      TASK_SOUND_EFFECTS_VOLUME_CONFIG_ID,
      String(DEFAULT_TASK_SOUND_EFFECTS_VOLUME)
    );
  const updateSoundEffectsVolume = useUpdateUserConfig();

  const { data: submitShortcut, isLoading: submitShortcutLoading } =
    useUserConfig('TASK_SUBMIT_SHORTCUT', 'enter');
  const updateSubmitShortcut = useUpdateUserConfig();
  const { data: dialogPresentationRaw, isLoading: dialogPresentationLoading } =
    useUserConfig(TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID, 'compact');
  const updateDialogPresentation = useUpdateUserConfig();
  const {
    data: quickCreateTargetListRaw,
    isLoading: quickCreateTargetListLoading,
  } = useUserConfig(
    TASK_QUICK_CREATE_TARGET_LIST_CONFIG_ID,
    DEFAULT_TASK_QUICK_CREATE_TARGET_LIST
  );
  const updateQuickCreateTargetList = useUpdateUserConfig();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-task-settings'],
    queryFn: async (): Promise<TaskSettingsData> => {
      const res = await fetch(getTaskApiUrl('/api/v1/users/task-settings'), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch task settings');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (settings?.fade_completed_tasks !== undefined) {
      updateBodyFadeAttribute(settings.fade_completed_tasks);
    }
  }, [settings?.fade_completed_tasks]);

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

  const handleSoundEffectsVolumeChange = (value: string) => {
    updateSoundEffectsVolume.mutate({
      configId: TASK_SOUND_EFFECTS_VOLUME_CONFIG_ID,
      value: String(clampTaskSoundEffectsVolume(value)),
    });
  };

  const effectiveAutoAssignValue = isPersonalWorkspace
    ? true
    : (settings?.task_auto_assign_to_self ?? false);
  const normalizedSoundEffectsVolume = String(
    clampTaskSoundEffectsVolume(soundEffectsVolume)
  );
  const dialogPresentation = normalizeTaskDialogPresentation(
    dialogPresentationRaw
  );
  const quickCreateTargetList = normalizeTaskQuickCreateTargetList(
    quickCreateTargetListRaw
  );

  const handleDialogPresentationChange = (value: string) => {
    const nextValue: TaskDialogPresentation = normalizeTaskDialogPresentation(
      value,
      'compact'
    );
    updateDialogPresentation.mutate({
      configId: TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
      value: nextValue,
    });
  };

  const handleQuickCreateTargetListChange = (value: string) => {
    const nextValue: TaskQuickCreateTargetList =
      normalizeTaskQuickCreateTargetList(value);
    updateQuickCreateTargetList.mutate({
      configId: TASK_QUICK_CREATE_TARGET_LIST_CONFIG_ID,
      value: nextValue,
    });
  };

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
          title={t('sound_effects')}
          description={t('sound_effects_description')}
        >
          <Switch
            aria-label={t('sound_effects')}
            checked={soundEffectsEnabled}
            onCheckedChange={setSoundEffectsEnabled}
            disabled={soundEffectsEnabledLoading || soundEffectsEnabledPending}
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('sound_effects_volume')}
          description={t('sound_effects_volume_description')}
        >
          <Select
            value={normalizedSoundEffectsVolume}
            onValueChange={handleSoundEffectsVolumeChange}
            disabled={
              soundEffectsVolumeLoading ||
              updateSoundEffectsVolume.isPending ||
              !soundEffectsEnabled
            }
          >
            <SelectTrigger
              aria-label={t('sound_effects_volume')}
              className="w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">
                {t('sound_effects_volume_soft')}
              </SelectItem>
              <SelectItem value="35">
                {t('sound_effects_volume_balanced')}
              </SelectItem>
              <SelectItem value="60">
                {t('sound_effects_volume_lively')}
              </SelectItem>
              <SelectItem value="85">
                {t('sound_effects_volume_bold')}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('dialog_presentation')}
          description={t('dialog_presentation_description')}
        >
          <Select
            value={dialogPresentation}
            onValueChange={handleDialogPresentationChange}
            disabled={
              dialogPresentationLoading || updateDialogPresentation.isPending
            }
          >
            <SelectTrigger
              aria-label={t('dialog_presentation')}
              className="w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">
                {t('dialog_presentation_compact')}
              </SelectItem>
              <SelectItem value="fullscreen">
                {t('dialog_presentation_immersive')}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('quick_create_target_list')}
          description={t('quick_create_target_list_description')}
        >
          <Select
            value={quickCreateTargetList}
            onValueChange={handleQuickCreateTargetListChange}
            disabled={
              quickCreateTargetListLoading ||
              updateQuickCreateTargetList.isPending
            }
          >
            <SelectTrigger
              aria-label={t('quick_create_target_list')}
              className="w-44"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default_list">
                {t('quick_create_target_list_default')}
              </SelectItem>
              <SelectItem value="hovered_list">
                {t('quick_create_target_list_hovered')}
              </SelectItem>
            </SelectContent>
          </Select>
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
          title={t('expand_mira_sections')}
          description={t('expand_mira_sections_description')}
        >
          <Switch
            checked={expandMiraSections}
            onCheckedChange={setExpandMiraSections}
            disabled={expandMiraSectionsLoading || expandMiraSectionsPending}
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('force_default_workspace_redirect')}
          description={t('force_default_workspace_redirect_description')}
        >
          <Switch
            checked={forceDefaultWsRedirect}
            onCheckedChange={setForceDefaultWsRedirect}
            disabled={
              forceDefaultWsRedirectLoading || forceDefaultWsRedirectPending
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('open_default_board')}
          description={t('open_default_board_description')}
        >
          <Switch
            checked={openDefaultBoard}
            onCheckedChange={setOpenDefaultBoard}
            disabled={openDefaultBoardLoading || openDefaultBoardPending}
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('show_review_due_dates')}
          description={t('show_review_due_dates_description')}
        >
          <Switch
            checked={showReviewDueDates}
            onCheckedChange={setShowReviewDueDates}
            disabled={showReviewDueDatesLoading || showReviewDueDatesPending}
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('navigation_progress')}
          description={t('navigation_progress_description')}
        >
          <Switch
            checked={showTaskProgressNavigation}
            onCheckedChange={setShowTaskProgressNavigation}
            disabled={
              showTaskProgressNavigationLoading ||
              showTaskProgressNavigationPending
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('navigation_goals')}
          description={t('navigation_goals_description')}
        >
          <Switch
            checked={showTaskGoalsNavigation}
            onCheckedChange={setShowTaskGoalsNavigation}
            disabled={
              showTaskGoalsNavigationLoading || showTaskGoalsNavigationPending
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('navigation_stats')}
          description={t('navigation_stats_description')}
        >
          <Switch
            checked={showTaskStatsNavigation}
            onCheckedChange={setShowTaskStatsNavigation}
            disabled={
              showTaskStatsNavigationLoading || showTaskStatsNavigationPending
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('navigation_leaderboards')}
          description={t('navigation_leaderboards_description')}
        >
          <Switch
            checked={showTaskLeaderboardsNavigation}
            onCheckedChange={setShowTaskLeaderboardsNavigation}
            disabled={
              showTaskLeaderboardsNavigationLoading ||
              showTaskLeaderboardsNavigationPending
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('navigation_import')}
          description={t('navigation_import_description')}
        >
          <Switch
            checked={showTaskImportNavigation}
            onCheckedChange={setShowTaskImportNavigation}
            disabled={
              showTaskImportNavigationLoading || showTaskImportNavigationPending
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          title={t('submit_shortcut')}
          description={t('submit_shortcut_description')}
        >
          <Select
            value={submitShortcut ?? 'enter'}
            onValueChange={(val) =>
              updateSubmitShortcut.mutate({
                configId: 'TASK_SUBMIT_SHORTCUT',
                value: val,
              })
            }
            disabled={submitShortcutLoading || updateSubmitShortcut.isPending}
          >
            <SelectTrigger className="w-45">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enter">
                {t('submit_shortcut_enter')}
              </SelectItem>
              <SelectItem value="cmd_enter">
                {t('submit_shortcut_cmd_enter')}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingItemTab>
        <Separator />
      </div>
    </div>
  );
}
