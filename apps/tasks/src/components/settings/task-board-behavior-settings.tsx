'use client';

import {
  SettingsGroup,
  SettingsRow,
} from '@tuturuuu/tasks-ui/tu-do/shared/settings-group';
import {
  TASK_AUTO_COLLAPSE_EMPTY_LISTS_CONFIG_ID,
  TASK_HIDE_EMPTY_LISTS_CONFIG_ID,
  TASK_PERSIST_COLLAPSED_LISTS_CONFIG_ID,
} from '@tuturuuu/tasks-ui/tu-do/shared/task-board-preferences';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

export function TaskBoardBehaviorSettings() {
  const t = useTranslations('settings.tasks');
  const persist = useUserBooleanConfig(
    TASK_PERSIST_COLLAPSED_LISTS_CONFIG_ID,
    true
  );
  const hide = useUserBooleanConfig(TASK_HIDE_EMPTY_LISTS_CONFIG_ID, false);
  const autoCollapse = useUserBooleanConfig(
    TASK_AUTO_COLLAPSE_EMPTY_LISTS_CONFIG_ID,
    false
  );

  const settings = [
    [
      'persist_collapsed_lists',
      persist.value,
      persist.setValue,
      persist.isLoading || persist.isPending,
    ],
    [
      'auto_collapse_empty_task_lists',
      autoCollapse.value,
      autoCollapse.setValue,
      autoCollapse.isLoading || autoCollapse.isPending,
    ],
    [
      'hide_empty_task_lists',
      hide.value,
      hide.setValue,
      hide.isLoading || hide.isPending,
    ],
  ] as const;

  return (
    <SettingsGroup
      description={t('board_behavior_description')}
      title={t('board_behavior')}
    >
      {settings.map(([key, checked, onCheckedChange, disabled]) => (
        <SettingsRow
          description={t(`${key}_description`)}
          key={key}
          label={t(key)}
        >
          <Switch
            aria-label={t(key)}
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
          />
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}
