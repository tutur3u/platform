'use client';

import { RotateCcw, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
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
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-sm">{t('task_cards')}</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('task_cards_description')}
          </p>
        </div>
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
      </div>

      <div className="divide-y rounded-md border">
        {TASK_CARD_HOTKEY_ACTIONS.map((action) => {
          const binding = bindings[action];
          const recording = recordingAction === action;
          const conflict = recording && conflictAction;
          return (
            <div
              className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2"
              key={action}
            >
              <div className="min-w-0">
                <div className="truncate text-sm">
                  {t(ACTION_LABEL_KEYS[action])}
                </div>
                {conflict ? (
                  <div className="mt-0.5 text-dynamic-red text-xs">
                    {t('shortcut_conflict', {
                      action: t(ACTION_LABEL_KEYS[conflict]),
                    })}
                  </div>
                ) : null}
              </div>
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
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">{t('task_cards_hint')}</p>
    </section>
  );
}
