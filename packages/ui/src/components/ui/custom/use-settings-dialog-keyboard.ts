'use client';

import type { KeyboardEvent } from 'react';
import { useCallback } from 'react';
import type { SettingsNavItem } from './satellite-settings-dialog-shell';

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

/**
 * Dialog-scoped shortcuts: Cmd/Ctrl+F or `/` focuses search, and
 * Alt+ArrowUp/ArrowDown/Home/End moves between enabled tabs.
 */
export function useSettingsDialogKeyboard({
  activeTab,
  enabled,
  focusSearch,
  items,
  selectTab,
}: {
  activeTab: string;
  enabled: boolean;
  focusSearch: () => void;
  items: SettingsNavItem[];
  selectTab: (tab: string) => void;
}) {
  const changeActiveItem = useCallback(
    (targetIndex: number) => {
      const targetItem = items[targetIndex];
      if (targetItem) selectTab(targetItem.name);
    },
    [items, selectTab]
  );

  const moveActiveItem = useCallback(
    (direction: 1 | -1) => {
      if (items.length === 0) return;

      const currentIndex = items.findIndex((item) => item.name === activeTab);
      const nextIndex =
        currentIndex === -1
          ? direction === 1
            ? 0
            : items.length - 1
          : (currentIndex + direction + items.length) % items.length;

      changeActiveItem(nextIndex);
    },
    [activeTab, changeActiveItem, items]
  );

  return useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!enabled || event.defaultPrevented) return;

      const key = event.key.toLowerCase();
      const isModifierSearch =
        (event.metaKey || event.ctrlKey) && !event.altKey && key === 'f';
      const isSlashSearch =
        !event.metaKey && !event.ctrlKey && !event.altKey && event.key === '/';

      if (isModifierSearch || isSlashSearch) {
        if (isSlashSearch && isEditableShortcutTarget(event.target)) return;

        event.preventDefault();
        focusSearch();
        return;
      }

      if (
        !event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActiveItem(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActiveItem(-1);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        changeActiveItem(0);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        changeActiveItem(items.length - 1);
      }
    },
    [changeActiveItem, enabled, focusSearch, items.length, moveActiveItem]
  );
}
