import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  StoredWhiteboardSnapshot,
  WhiteboardPersistence,
} from '../adapters';
import { isExcalidrawSnapshot, toStoredWhiteboardSnapshot } from '../snapshot';
import type { ExcalidrawElement, WhiteboardSnapshot } from '../types';
import type { WhiteboardNotice, WhiteboardSyncStatus } from './notices';

export interface ScenePersistenceOptions {
  persistence?: WhiteboardPersistence;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  previousElementsRef: MutableRefObject<readonly ExcalidrawElement[]>;
  initialData?: WhiteboardSnapshot;
  /** Latest snapshot read by the host; applied when newer and nothing is unsaved. */
  storedSnapshot?: StoredWhiteboardSnapshot | null;
  autoSaveDebounceMs?: number;
  notify?: (notice: WhiteboardNotice) => void;
}

const snapshotKey = (elements: readonly ExcalidrawElement[]) =>
  JSON.stringify({ elements });

/**
 * Debounced auto-save plus catch-up: a stored snapshot the host hands in is
 * applied only when its revision is new and there are no unsaved local edits.
 */
export function useScenePersistence({
  persistence,
  apiRef,
  previousElementsRef,
  initialData,
  storedSnapshot,
  autoSaveDebounceMs = 1000,
  notify,
}: ScenePersistenceOptions) {
  const [syncStatus, setSyncStatus] = useState<WhiteboardSyncStatus>('synced');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const lastSavedRef = useRef<string | null>(null);
  const pendingChangesRef = useRef(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRevisionRef = useRef<string | null>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const performSave = useCallback(async () => {
    const api = apiRef.current;
    if (!api || !persistence) return;

    setSyncStatus('syncing');
    setLastSyncError(null);

    try {
      const elements = api.getSceneElements();
      const snapshot = toStoredWhiteboardSnapshot(elements, api.getAppState());

      await persistence.save(snapshot);

      lastSavedRef.current = snapshotKey(elements);
      pendingChangesRef.current = false;
      setSyncStatus('synced');
    } catch (error) {
      console.error('Save error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setLastSyncError(message);
      setSyncStatus('error');
      notifyRef.current?.({
        kind: 'save-failed',
        message,
        retry: () => void performSave(),
      });
    }
  }, [apiRef, persistence]);

  const cancelAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  }, []);

  const triggerAutoSave = useCallback(() => {
    cancelAutoSave();

    pendingChangesRef.current = true;
    setSyncStatus('syncing');

    autoSaveTimeoutRef.current = setTimeout(() => {
      void performSave();
    }, autoSaveDebounceMs);
  }, [autoSaveDebounceMs, cancelAutoSave, performSave]);

  const saveNow = useCallback(async () => {
    cancelAutoSave();
    await performSave();
  }, [cancelAutoSave, performSave]);

  /** Whether the live (non-deleted) scene differs from what was last saved. */
  const hasUnsavedChanges = useCallback(
    (elements: readonly ExcalidrawElement[]) =>
      JSON.stringify({ elements: elements.filter((el) => !el.isDeleted) }) !==
      lastSavedRef.current,
    []
  );

  // Seed the saved baseline from the scene the editor starts with.
  useEffect(() => {
    const elements = initialData?.elements ?? [];
    lastSavedRef.current = snapshotKey(elements);
    previousElementsRef.current = elements.map((el) => ({ ...el }));
  }, [initialData, previousElementsRef]);

  // Apply a newer stored snapshot the host read, unless local edits are unsaved.
  useEffect(() => {
    if (!storedSnapshot) return;

    const { snapshot, revision } = storedSnapshot;

    if (!revision || revision === lastRevisionRef.current) return;
    if (pendingChangesRef.current) return;
    if (!isExcalidrawSnapshot(snapshot)) return;

    const api = apiRef.current;
    if (!api) return;

    try {
      const nextElements = snapshot.elements ?? [];

      api.updateScene({ elements: nextElements });

      previousElementsRef.current = nextElements.map((el) => ({ ...el }));
      lastSavedRef.current = snapshotKey(nextElements);
      lastRevisionRef.current = revision;
    } catch (error) {
      console.error('Failed to apply whiteboard snapshot catchup:', error);
    }
  }, [storedSnapshot, apiRef, previousElementsRef]);

  useEffect(() => cancelAutoSave, [cancelAutoSave]);

  // Cmd+S / Ctrl+S saves immediately.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        void saveNow();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveNow]);

  return {
    syncStatus,
    lastSyncError,
    saveNow,
    triggerAutoSave,
    hasUnsavedChanges,
  };
}
