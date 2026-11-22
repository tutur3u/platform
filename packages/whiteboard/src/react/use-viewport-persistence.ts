import type { AppState } from '@excalidraw/excalidraw/types';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { WhiteboardSnapshot } from '../types';
import { type PersistedViewport, parsePersistedViewport } from '../viewport';

const VIEWPORT_SAVE_DEBOUNCE_MS = 400;

export type ViewportStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): ViewportStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Remembers scroll and zoom per board and folds the remembered viewport into
 * the scene the editor starts with.
 */
export function useViewportPersistence(
  storageKey: string | undefined,
  initialData: WhiteboardSnapshot | undefined,
  storage?: ViewportStorage
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PersistedViewport | null>(null);

  const resolveStorage = useCallback(
    () => storage ?? defaultStorage(),
    [storage]
  );

  const persisted = useMemo(() => {
    if (!storageKey) return null;

    try {
      return parsePersistedViewport(
        resolveStorage()?.getItem(storageKey) ?? null
      );
    } catch {
      return null;
    }
  }, [resolveStorage, storageKey]);

  const effectiveInitialData = useMemo(() => {
    if (!persisted) return initialData;

    return {
      ...initialData,
      appState: {
        ...initialData?.appState,
        scrollX: persisted.scrollX,
        scrollY: persisted.scrollY,
        zoom: persisted.zoom,
      },
    };
  }, [initialData, persisted]);

  const store = useCallback(
    (viewport: PersistedViewport | null) => {
      if (!viewport || !storageKey) return;

      try {
        resolveStorage()?.setItem(storageKey, JSON.stringify(viewport));
      } catch (error) {
        console.error('Failed to store whiteboard viewport:', error);
      }
    },
    [resolveStorage, storageKey]
  );

  const persist = useCallback(
    (appState: AppState) => {
      pendingRef.current = {
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      };

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        store(pendingRef.current);
      }, VIEWPORT_SAVE_DEBOUNCE_MS);
    },
    [store]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      store(pendingRef.current);
    };
  }, [store]);

  return { effectiveInitialData, persistViewport: persist };
}
