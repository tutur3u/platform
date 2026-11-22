import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { WhiteboardPersistence } from '../adapters';
import { isExcalidrawSnapshot, toStoredWhiteboardSnapshot } from '../snapshot';
import type { ExcalidrawElement, WhiteboardSnapshot } from '../types';
import type { WhiteboardNotice, WhiteboardSyncStatus } from './notices';

export interface ScenePersistenceOptions {
  persistence?: WhiteboardPersistence;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  previousElementsRef: MutableRefObject<readonly ExcalidrawElement[]>;
  initialData?: WhiteboardSnapshot;
  autoSaveDebounceMs?: number;
  notify?: (notice: WhiteboardNotice) => void;
}

const snapshotKey = (elements: readonly ExcalidrawElement[]) =>
  JSON.stringify({ elements });

/**
 * Debounced auto-save plus catch-up: the stored snapshot is re-read when the
 * window regains focus, the network returns or the live connection resumes,
 * and applied only while there are no unsaved local edits.
 */
export function useScenePersistence({
  persistence,
  apiRef,
  previousElementsRef,
  initialData,
  autoSaveDebounceMs = 1000,
  notify,
}: ScenePersistenceOptions) {
  const [syncStatus, setSyncStatus] = useState<WhiteboardSyncStatus>('synced');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const lastSavedRef = useRef<string | null>(null);
  const pendingChangesRef = useRef(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRevisionRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
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

  /** Re-reads the stored snapshot and applies it if it is newer and safe to apply. */
  const refresh = useCallback(async () => {
    if (!persistence || loadingRef.current) return;
    loadingRef.current = true;

    try {
      const stored = await persistence.load();
      const { snapshot, revision } = stored;

      if (!revision || revision === lastRevisionRef.current) return;
      if (pendingChangesRef.current) return;
      if (!isExcalidrawSnapshot(snapshot)) return;

      const api = apiRef.current;
      if (!api) return;

      const nextElements = snapshot.elements ?? [];

      api.updateScene({ elements: nextElements });

      previousElementsRef.current = nextElements.map((el) => ({ ...el }));
      lastSavedRef.current = snapshotKey(nextElements);
      lastRevisionRef.current = revision;
    } catch (error) {
      console.error('Failed to apply whiteboard snapshot catchup:', error);
    } finally {
      loadingRef.current = false;
    }
  }, [apiRef, persistence, previousElementsRef]);

  // Seed the saved baseline from the scene the editor starts with.
  useEffect(() => {
    const elements = initialData?.elements ?? [];
    lastSavedRef.current = snapshotKey(elements);
    previousElementsRef.current = elements.map((el) => ({ ...el }));
  }, [initialData, previousElementsRef]);

  useEffect(() => {
    void refresh();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onFocus = () => void refresh();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [refresh]);

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
    refresh,
  };
}
