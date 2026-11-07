'use client';

import { RotateCcw, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import {
  useUpdateUserConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import { Kbd } from '@tuturuuu/ui/kbd';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_TASK_CARD_HOTKEYS,
  findTaskCardHotkeyConflict,
  getTaskCardHotkeyDisplayKeys,
  keyboardEventToTaskCardBinding,
  parseTaskCardHotkeyBindings,
  serializeTaskCardHotkeyBindings,
  TASK_CARD_HOTKEY_ACTIONS,
  TASK_CARD_HOTKEYS_CONFIG_ID,
  type TaskCardHotkeyAction,
} from '../tu-do/shared/task-card-hotkeys';

const ACTION_LABEL_KEYS: Record<TaskCardHotkeyAction, string> = {
  priority: 'priority',
  labels: 'labels',
  estimation: 'estimation',
  due_date: 'due_date',
  projects: 'projects',
  assignees: 'assignees',
  move: 'move',
};

interface TaskCardHotkeySettingsProps {
  translate: (key: string, values?: { action?: string }) => string;
}

export function TaskCardHotkeySettings({
  translate: t,
}: TaskCardHotkeySettingsProps) {
  const { modKey } = usePlatform();
  const { data: rawBindings, isLoading } = useUserConfig(
    TASK_CARD_HOTKEYS_CONFIG_ID,
    ''
  );
  const updateConfig = useUpdateUserConfig();
  const bindings = useMemo(
    () => parseTaskCardHotkeyBindings(rawBindings),
    [rawBindings]
  );
  const [recordingAction, setRecordingAction] =
    useState<TaskCardHotkeyAction | null>(null);
  const [conflictAction, setConflictAction] =
    useState<TaskCardHotkeyAction | null>(null);

  const saveBindings = (nextBindings: typeof bindings) => {
    updateConfig.mutate({
      configId: TASK_CARD_HOTKEYS_CONFIG_ID,
      value: serializeTaskCardHotkeyBindings(nextBindings),
    });
  };

  const updateBinding = (action: TaskCardHotkeyAction, binding: string) => {
    const conflict = findTaskCardHotkeyConflict(bindings, action, binding);
    if (conflict) {
      setConflictAction(conflict);
      return;
    }
    setConflictAction(null);
    setRecordingAction(null);
    saveBindings({ ...bindings, [action]: binding });
  };

  const handleRecorderKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    action: TaskCardHotkeyAction
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecordingAction(null);
      setConflictAction(null);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      updateBinding(action, '');
      return;
    }
    const binding = keyboardEventToTaskCardBinding(event.nativeEvent);
    if (binding) updateBinding(action, binding);
  };

  return (
    <SettingsSection
      action={
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isLoading || updateConfig.isPending}
          onClick={() => saveBindings(DEFAULT_TASK_CARD_HOTKEYS)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('reset_defaults')}
        </Button>
      }
      description={t('task_cards_description')}
      title={t('task_cards')}
    >
      {TASK_CARD_HOTKEY_ACTIONS.map((action) => {
        const binding = bindings[action];
        const recording = recordingAction === action;
        const conflict = recording && conflictAction;
        return (
          <SettingItemTab
            description={
              conflict ? (
                <span className="text-dynamic-red">
                  {t('shortcut_conflict', {
                    action: t(ACTION_LABEL_KEYS[conflict]),
                  })}
                </span>
              ) : null
            }
            key={action}
            title={t(ACTION_LABEL_KEYS[action])}
          >
            <div className="flex items-center gap-1.5">
              <Button
                variant={recording ? 'secondary' : 'outline'}
                size="sm"
                className="min-w-24 justify-center"
                disabled={isLoading || updateConfig.isPending}
                onClick={() => {
                  setRecordingAction(action);
                  setConflictAction(null);
                }}
                onKeyDown={(event) => handleRecorderKeyDown(event, action)}
              >
                {recording ? (
                  <span className="text-muted-foreground text-xs">
                    {t('press_shortcut')}
                  </span>
                ) : binding ? (
                  <span className="flex items-center gap-1">
                    {getTaskCardHotkeyDisplayKeys(binding).map((key) => (
                      <Kbd key={key}>{key === 'Mod' ? modKey : key}</Kbd>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {t('disabled')}
                  </span>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('clear_shortcut')}
                disabled={!binding || isLoading || updateConfig.isPending}
                onClick={() => updateBinding(action, '')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </SettingItemTab>
        );
      })}
      <SettingsSectionMessage className="py-3">
        {t('task_cards_hint')}
      </SettingsSectionMessage>
    </SettingsSection>
  );
}
