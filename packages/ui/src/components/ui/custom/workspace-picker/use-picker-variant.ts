'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { PickerVariant } from './row-layout';

const SHEET_QUERY = '(max-width: 767px)';

function subscribeSheet(onStoreChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(SHEET_QUERY);
  if (typeof query.addEventListener !== 'function') return () => {};
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

function sheetSnapshot() {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(SHEET_QUERY).matches;
}

export function usePickerVariant(): PickerVariant {
  const sheet = useSyncExternalStore(
    subscribeSheet,
    sheetSnapshot,
    () => false
  );
  return sheet ? 'sheet' : 'dialog';
}

/**
 * ⌘K / Ctrl+K is already owned by the global command launcher (and the web
 * and finance palettes). Shift keeps this picker off that shortcut.
 */
export function useWorkspacePickerShortcut(open: () => void) {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      openRef.current();
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);
}
