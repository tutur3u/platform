'use client';

import type {
  AppState,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import {
  forwardRef,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  StoredWhiteboardSnapshot,
  WhiteboardAssets,
  WhiteboardPersistence,
  WhiteboardTransport,
} from '../adapters';
import { mergeElements } from '../sync/elements';
import { getSelectionSignature } from '../sync/selection';
import type { WhiteboardPresenceMember } from '../sync/collaborators';
import type {
  ExcalidrawElement,
  WhiteboardIdentity,
  WhiteboardSnapshot,
} from '../types';
import type {
  WhiteboardEditorHandle,
  WhiteboardEditorStatus,
  WhiteboardNotice,
} from './notices';
import { useWhiteboardCollaboration } from './use-collaboration';
import { useImageFiles } from './use-image-files';
import { useScenePersistence } from './use-scene-persistence';
import {
  useViewportPersistence,
  type ViewportStorage,
} from './use-viewport-persistence';

const ExcalidrawCanvas = lazy(() => import('./excalidraw-canvas'));

export interface WhiteboardCollaborationConfig {
  transport: WhiteboardTransport;
  /** Keep this object referentially stable; a new identity reconnects the transport. */
  user: WhiteboardIdentity;
  enabled?: boolean;
  presence?: readonly WhiteboardPresenceMember[];
  pageVisible?: boolean;
}

export interface WhiteboardEditorProps {
  initialData?: WhiteboardSnapshot;
  theme: 'light' | 'dark';
  /** Renders the board without editing tools. */
  readOnly?: boolean;
  onChange?: (
    elements: readonly ExcalidrawElement[],
    appState: AppState
  ) => void;
  persistence?: WhiteboardPersistence;
  /**
   * The latest snapshot the host read from its store. The editor applies it
   * when its revision is new and no local edit is unsaved; refetching (on
   * focus, reconnect, ...) is the host's job.
   */
  storedSnapshot?: StoredWhiteboardSnapshot | null;
  assets?: WhiteboardAssets;
  collaboration?: WhiteboardCollaborationConfig;
  /** Remembers scroll and zoom under this key. */
  viewportStorageKey?: string;
  viewportStorage?: ViewportStorage;
  autoSaveDebounceMs?: number;
  onStatusChange?: (status: WhiteboardEditorStatus) => void;
  onNotify?: (notice: WhiteboardNotice) => void;
  /** Shown while Excalidraw loads. */
  fallback?: ReactNode;
}

const IDLE_USER: WhiteboardIdentity = { id: '', displayName: '' };
const NOOP_TRANSPORT: WhiteboardTransport = {
  connect: () => () => {},
  sendElementChanges: async () => {},
  sendCursor: async () => {},
  sendSelection: async () => {},
};

export const WhiteboardEditor = forwardRef<
  WhiteboardEditorHandle,
  WhiteboardEditorProps
>(function WhiteboardEditor(
  {
    initialData,
    theme,
    readOnly = false,
    onChange,
    persistence,
    storedSnapshot,
    assets,
    collaboration,
    viewportStorageKey,
    viewportStorage,
    autoSaveDebounceMs,
    onStatusChange,
    onNotify,
    fallback = null,
  },
  ref
) {
  // Excalidraw needs the DOM, so the first server and client render match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const previousElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const lastSelectionSignatureRef = useRef('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const { effectiveInitialData, persistViewport } = useViewportPersistence(
    viewportStorageKey,
    initialData,
    viewportStorage
  );

  const {
    syncStatus,
    lastSyncError,
    saveNow,
    triggerAutoSave,
    hasUnsavedChanges,
  } = useScenePersistence({
    persistence,
    storedSnapshot,
    apiRef,
    previousElementsRef,
    initialData,
    autoSaveDebounceMs,
    notify: onNotify,
  });

  const ensureImageFilesLoaded = useImageFiles(apiRef, assets);

  const collaborationEnabled =
    !!collaboration && collaboration.enabled !== false;

  const {
    collaborators,
    isConnected,
    broadcastElementChanges,
    broadcastCursorPosition,
    broadcastSelectionChange,
  } = useWhiteboardCollaboration({
    transport: collaboration?.transport ?? NOOP_TRANSPORT,
    user: collaboration?.user ?? IDLE_USER,
    enabled: collaborationEnabled,
    presence: collaboration?.presence,
    pageVisible: collaboration?.pageVisible,
    onRemoteElementsChange: useCallback((remote: ExcalidrawElement[]) => {
      const api = apiRef.current;
      if (!api) return;

      const merged = mergeElements(api.getSceneElements(), remote);

      previousElementsRef.current = merged.map((el) => ({ ...el }));
      api.updateScene({ elements: merged });
    }, []),
    onError: useCallback((error: Error) => {
      onNotifyRef.current?.({ kind: 'collaboration-error', error });
    }, []),
  });

  useImperativeHandle(ref, () => ({ save: saveNow }), [saveNow]);

  useEffect(() => {
    onStatusChange?.({ syncStatus, lastSyncError, isConnected });
  }, [syncStatus, lastSyncError, isConnected, onStatusChange]);

  useEffect(() => {
    apiRef.current?.updateScene({ collaborators });
  }, [collaborators]);

  const handleApi = useCallback((api: ExcalidrawImperativeAPI | null) => {
    apiRef.current = api;
  }, []);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      ensureImageFilesLoaded(elements);
      persistViewport(appState);

      const hasChanges = hasUnsavedChanges(elements);

      if (previousElementsRef.current.length > 0 || elements.length > 0) {
        broadcastElementChanges(previousElementsRef.current, elements);
      }

      const selectionSignature = getSelectionSignature(
        appState.selectedElementIds
      );
      if (selectionSignature !== lastSelectionSignatureRef.current) {
        lastSelectionSignatureRef.current = selectionSignature;
        broadcastSelectionChange(appState.selectedElementIds);
      }

      previousElementsRef.current = elements.map((el) => ({ ...el }));

      onChangeRef.current?.(elements, appState);

      if (persistence && hasChanges) {
        triggerAutoSave();
      }
    },
    [
      broadcastElementChanges,
      broadcastSelectionChange,
      ensureImageFilesLoaded,
      hasUnsavedChanges,
      persistViewport,
      persistence,
      triggerAutoSave,
    ]
  );

  const handlePointerUpdate = useCallback(
    (payload: { pointer: { x: number; y: number; tool: string } }) => {
      broadcastCursorPosition(
        payload.pointer.x,
        payload.pointer.y,
        payload.pointer.tool
      );
    },
    [broadcastCursorPosition]
  );

  const handleGenerateIdForFile = useCallback(
    (file: File) => {
      if (!assets) {
        return Promise.reject(new Error('Image uploads are not available'));
      }
      return assets.upload(file);
    },
    [assets]
  );

  // Surface image paste problems instead of failing silently.
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const hasImage = Array.from(clipboardData.types).some((type) =>
        type.startsWith('image/')
      );
      if (!hasImage) return;

      try {
        for (const item of clipboardData.items) {
          if (item.type.startsWith('image/') && !item.getAsFile()) {
            onNotifyRef.current?.({ kind: 'paste-image-unreadable' });
            return;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes('clipboard') ||
          message.includes('Clipboard') ||
          message.includes('model') ||
          message.includes('not support')
        ) {
          onNotifyRef.current?.({ kind: 'paste-image-restricted' });
          event.preventDefault();
        }
      }
    };

    window.addEventListener('paste', handlePaste, { capture: true });
    return () =>
      window.removeEventListener('paste', handlePaste, { capture: true });
  }, []);

  if (!mounted) return <>{fallback}</>;

  return (
    <Suspense fallback={fallback}>
      <ExcalidrawCanvas
        excalidrawAPI={handleApi}
        initialData={effectiveInitialData}
        onChange={handleChange}
        onPointerUpdate={handlePointerUpdate}
        generateIdForFile={assets ? handleGenerateIdForFile : undefined}
        theme={theme}
        viewModeEnabled={readOnly}
        isCollaborating={collaborationEnabled}
      />
    </Suspense>
  );
});
