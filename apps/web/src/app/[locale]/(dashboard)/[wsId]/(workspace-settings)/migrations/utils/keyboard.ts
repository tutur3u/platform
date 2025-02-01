import { useEffect } from 'react';

type KeyboardShortcut = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  description: string;
  action: () => void;
};

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcut[]) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if focus is in an input or textarea
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const matchingShortcut = shortcuts.find(
        (shortcut) =>
          shortcut.key.toLowerCase() === event.key.toLowerCase() &&
          !!shortcut.ctrlKey === event.ctrlKey &&
          !!shortcut.altKey === event.altKey &&
          !!shortcut.shiftKey === event.shiftKey
      );

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.action();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

export const getShortcutDisplay = (shortcut: KeyboardShortcut): string => {
  const parts: string[] = [];
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.shiftKey) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());
  return parts.join(' + ');
};

export const defaultShortcuts: KeyboardShortcut[] = [
  {
    key: '/',
    description: 'Focus search',
    action: () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        '[data-search-input]'
      );
      if (searchInput) {
        searchInput.focus();
      }
    },
  },
  {
    key: 'Escape',
    description: 'Clear search',
    action: () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        '[data-search-input]'
      );
      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
  },
  {
    key: 'f',
    description: 'Open filters',
    action: () => {
      const filterButton = document.querySelector<HTMLButtonElement>(
        '[data-filter-button]'
      );
      if (filterButton) {
        filterButton.click();
      }
    },
  },
  {
    key: 'r',
    description: 'Refresh all',
    action: () => {
      const refreshButton = document.querySelector<HTMLButtonElement>(
        '[data-refresh-button]'
      );
      if (refreshButton && !refreshButton.disabled) {
        refreshButton.click();
      }
    },
  },
  {
    key: 'm',
    description: 'Migrate all',
    action: () => {
      const migrateButton = document.querySelector<HTMLButtonElement>(
        '[data-migrate-button]'
      );
      if (migrateButton && !migrateButton.disabled) {
        migrateButton.click();
      }
    },
  },
];
