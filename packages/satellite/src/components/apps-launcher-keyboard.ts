import { isShortcutEventIgnored } from '@tuturuuu/utils/keyboard-shortcuts';
import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react';
import type { AppsLauncherEntry } from './apps-launcher-view';

/** Opens the launcher on Cmd/Ctrl+Shift+K from anywhere on the page. */
export function useAppsLauncherShortcut(onOpen: () => void) {
  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (isShortcutEventIgnored(event)) return;
      if (
        event.key.toLocaleLowerCase() === 'k' &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }
    };

    document.addEventListener('keydown', handleShortcut, { capture: true });
    return () =>
      document.removeEventListener('keydown', handleShortcut, {
        capture: true,
      });
  }, [onOpen]);
}

function isFavoriteShortcut(event: KeyboardEvent) {
  return (
    event.key.toLocaleLowerCase() === 's' &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

type ActiveTarget = { id: string; slug: string };

/**
 * Tracks the active option of the launcher listbox while focus stays in the
 * search input. Up/Down walk the flat option list without wrapping, Enter
 * activates the option's link, and Cmd/Ctrl+S toggles its favorite. When
 * the active option leaves the list (for example after unstarring a
 * favorite) the last option for the same app takes over.
 */
export function useAppsLauncherKeyboard({
  contentRef,
  defaultEntry,
  entries,
  onToggleFavorite,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  defaultEntry: AppsLauncherEntry | undefined;
  entries: readonly AppsLauncherEntry[];
  onToggleFavorite: (slug: string) => void;
}) {
  const [target, setTarget] = useState<ActiveTarget | null>(null);

  function resolveActive() {
    if (!target) return defaultEntry;
    const exact = entries.find((entry) => entry.id === target.id);
    if (exact) return exact;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (entries[index]?.app.slug === target.slug) return entries[index];
    }
    return defaultEntry;
  }

  const activeEntry = resolveActive();

  function getOptionElement(id: string) {
    return contentRef.current?.ownerDocument.getElementById(id) ?? null;
  }

  function setActiveEntry(entry: AppsLauncherEntry, scroll = false) {
    setTarget({ id: entry.id, slug: entry.app.slug });
    if (scroll)
      getOptionElement(entry.id)?.scrollIntoView?.({ block: 'nearest' });
  }

  function move(offset: number) {
    if (entries.length === 0) return;
    const index = activeEntry ? entries.indexOf(activeEntry) : -1;
    const nextIndex = Math.min(
      entries.length - 1,
      Math.max(0, index === -1 ? 0 : index + offset)
    );
    const next = entries[nextIndex];
    if (next) setActiveEntry(next, true);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && activeEntry) {
      event.preventDefault();
      getOptionElement(activeEntry.id)?.click();
    } else if (isFavoriteShortcut(event)) {
      event.preventDefault();
      if (!activeEntry) return;
      // Pin the row so the highlight stays put when Favorites changes size.
      setActiveEntry(activeEntry);
      onToggleFavorite(activeEntry.app.slug);
    }
  }

  return {
    activeEntry,
    handleSearchKeyDown,
    resetActiveEntry: () => setTarget(null),
    setActiveEntry,
  };
}
