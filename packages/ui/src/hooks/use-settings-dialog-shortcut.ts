'use client';

import { useEffect } from 'react';

interface UseSettingsDialogShortcutOptions {
  enabled: boolean;
  onOpen: () => void;
}

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

function isSettingsDialogShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key === ',';
}

/**
 * Opens the app settings dialog on Cmd/Ctrl+, — the platform-wide convention.
 * Ignores the shortcut while typing in editable fields and when another handler
 * has already called preventDefault(). Shared by apps/web and every satellite
 * app (wired once in the satellite user-nav shell).
 */
export function useSettingsDialogShortcut({
  enabled,
  onOpen,
}: UseSettingsDialogShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isSettingsDialogShortcut(event)) return;
      if (isEditableShortcutTarget(event.target)) return;

      event.preventDefault();
      onOpen();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onOpen]);
}
