'use client';

import {
  TASK_AUTO_COLLAPSE_EMPTY_LISTS_CONFIG_ID,
  TASK_HIDE_EMPTY_LISTS_CONFIG_ID,
  TASK_PERSIST_COLLAPSED_LISTS_CONFIG_ID,
} from '@tuturuuu/tasks-ui/tu-do/shared/task-board-preferences';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Separator } from '@tuturuuu/ui/separator';
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
    <div className="space-y-4 rounded-2xl border bg-background p-4 sm:p-5">
      <div className="space-y-1">
        <h3 className="font-medium">{t('board_behavior')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('board_behavior_description')}
        </p>
      </div>
      <div className="grid gap-4">
        {settings.map(([key, checked, onCheckedChange, disabled], index) => (
          <div className="contents" key={key}>
            {index > 0 && <Separator />}
            <SettingItemTab
              title={t(key)}
              description={t(`${key}_description`)}
            >
              <Switch
                aria-label={t(key)}
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
              />
            </SettingItemTab>
          </div>
        ))}
      </div>
    </div>
  );
}
