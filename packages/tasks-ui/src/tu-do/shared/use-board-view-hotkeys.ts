'use client';

import {
  formatHotkeySequence,
  useHotkeySequence,
} from '@tanstack/react-hotkeys';
import { useMemo } from 'react';
import type { ViewType } from './board-views';

const HOTKEY_GO_TO_KANBAN: ['G', 'K'] = ['G', 'K'];
const HOTKEY_GO_TO_LIST: ['G', 'L'] = ['G', 'L'];
const HOTKEY_GO_TO_MY_TASKS: ['G', 'M'] = ['G', 'M'];
const HOTKEY_GO_TO_TIMELINE: ['G', 'T'] = ['G', 'T'];
const HOTKEY_GO_TO_DRAFTS: ['G', 'D'] = ['G', 'D'];
const HOTKEY_GO_TO_RECYCLE_BIN: ['G', 'R'] = ['G', 'R'];

/** G-sequences that switch board views, and their labels for the View menu. */
export function useBoardViewHotkeys(
  onViewChange: (view: ViewType) => void,
  viewIsEnabled: (view: ViewType) => boolean
) {
  const options = (view: ViewType) => ({
    enabled: viewIsEnabled(view),
    ignoreInputs: true,
    preventDefault: true,
  });

  useHotkeySequence(
    HOTKEY_GO_TO_KANBAN,
    () => onViewChange('kanban'),
    options('kanban')
  );
  useHotkeySequence(
    HOTKEY_GO_TO_LIST,
    () => onViewChange('list'),
    options('list')
  );
  useHotkeySequence(
    HOTKEY_GO_TO_MY_TASKS,
    () => onViewChange('my_tasks'),
    options('my_tasks')
  );
  useHotkeySequence(
    HOTKEY_GO_TO_TIMELINE,
    () => onViewChange('timeline'),
    options('timeline')
  );
  useHotkeySequence(
    HOTKEY_GO_TO_DRAFTS,
    () => onViewChange('drafts'),
    options('drafts')
  );
  useHotkeySequence(
    HOTKEY_GO_TO_RECYCLE_BIN,
    () => onViewChange('recycle_bin'),
    options('recycle_bin')
  );

  return useMemo(
    () => ({
      kanban: formatHotkeySequence(HOTKEY_GO_TO_KANBAN),
      list: formatHotkeySequence(HOTKEY_GO_TO_LIST),
      my_tasks: formatHotkeySequence(HOTKEY_GO_TO_MY_TASKS),
      timeline: formatHotkeySequence(HOTKEY_GO_TO_TIMELINE),
      drafts: formatHotkeySequence(HOTKEY_GO_TO_DRAFTS),
      recycle_bin: formatHotkeySequence(HOTKEY_GO_TO_RECYCLE_BIN),
    }),
    []
  );
}
