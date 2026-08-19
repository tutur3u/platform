'use client';

import type { RefObject } from 'react';
import { useEffect } from 'react';
import {
  TASK_CARD_HOTKEY_ACTIONS,
  TASK_CARD_HOTKEY_EVENT,
  type TaskCardHotkeyAction,
} from '../../../shared/task-card-hotkeys';

export function useTaskCardHotkeyTarget({
  cardRef,
  onAction,
}: {
  cardRef: RefObject<HTMLElement | null>;
  onAction: (action: TaskCardHotkeyAction) => void;
}) {
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handleHotkey = (event: Event) => {
      const action = (event as CustomEvent<{ action?: unknown }>).detail
        ?.action;
      if (
        typeof action === 'string' &&
        TASK_CARD_HOTKEY_ACTIONS.includes(action as TaskCardHotkeyAction)
      ) {
        onAction(action as TaskCardHotkeyAction);
      }
    };

    card.addEventListener(TASK_CARD_HOTKEY_EVENT, handleHotkey);
    return () => card.removeEventListener(TASK_CARD_HOTKEY_EVENT, handleHotkey);
  }, [cardRef, onAction]);
}
