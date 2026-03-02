'use client';

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { useWhiteboardCollaboration } from '@/hooks/useWhiteboardCollaboration';
import { mergeElements } from '@/utils/excalidraw-helper';
import { getSelectionSignature } from '@/utils/excalidraw-selection';
import '@excalidraw/excalidraw/index.css';
import type {
  AppState,
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  CloudIcon,
  CloudOffIcon,
  Loader2Icon,
  PencilIcon,
  WifiIcon,
  WifiOffIcon,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useOptionalWorkspacePresenceContext } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import {
  PresenceAvatarList,
  type PresenceViewerEntry,
} from '@tuturuuu/ui/tu-do/shared/user-presence-avatars';
import { cn } from '@tuturuuu/utils/format';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './excalidraw-overrides.css';

const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  {
    ssr: false,
  }
);

interface CustomWhiteboardProps {
  wsId: string;
  boardId: string;
  boardName: string;
  initialData?: {
    elements?: ExcalidrawElement[];
    appState?: Partial<AppState>;
  };
}

// Auto-save debounce interval (1 second for responsive saving)
const AUTO_SAVE_DEBOUNCE_MS = 1000;
// Title save debounce (500ms)
const TITLE_SAVE_DEBOUNCE_MS = 500;

type SyncStatus = 'synced' | 'syncing' | 'error';

export function CustomWhiteboard({
  wsId,
  boardId,
  boardName,
  initialData,
}: CustomWhiteboardProps) {
  const supabase = createClient();
  const { resolvedTheme } = useTheme();
  const t = useTranslations('ws-presence');
  const wsPresence = useOptionalWorkspacePresenceContext();

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(boardName);

  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const lastSelectionSignatureRef = useRef('');
  const previousElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef(false);
  const requestedFileIdsRef = useRef<Set<string>>(new Set());
  const lastSnapshotUpdatedAtRef = useRef<string | null>(null);
  const previousConnectionStatusRef = useRef<boolean | null>(null);

  const {
    collaborators,
    isConnected,
    currentUserId,
    broadcastElementChanges,
    broadcastCursorPosition,
    broadcastSelectionChange,
  } = useWhiteboardCollaboration({
    boardId,
    wsId,
    enabled: wsPresence?.realtimeEnabled ?? false,
    externalPresenceState: wsPresence ? wsPresence.presenceState : undefined,
    externalCurrentUserId: wsPresence?.currentUserId,
    onRemoteElementsChange: useCallback(
      (remoteElements: ExcalidrawElement[]) => {
        const api = excalidrawAPIRef.current;
        if (!api) return;

        const currentElements = api.getSceneElements();
        const mergedElements = mergeElements(
          [...currentElements],
          remoteElements
        );

        previousElementsRef.current = mergedElements.map((el) => ({ ...el }));

        // Update the scene with merged elements
        api.updateScene({ elements: mergedElements });
      },
      []
    ),
    onError: useCallback((error: Error) => {
      console.error('Collaboration error:', error);
      toast.error('Collaboration connection issue. Changes may not sync.');
    }, []),
  });

  const snapshotQuery = useQuery({
    queryKey: ['whiteboard-snapshot', wsId, boardId],
    queryFn: async () => {
      const client = createClient();
      const { data, error } = await client
        .from('workspace_whiteboards')
        .select('snapshot, updated_at')
        .eq('id', boardId)
        .eq('ws_id', wsId)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch whiteboard snapshot:', error);
        throw error;
      }

      return {
        snapshot: data?.snapshot as string | null | undefined,
        updated_at: data?.updated_at as string | null | undefined,
      };
    },
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: true,
  });

  const { refetch: refetchSnapshot } = snapshotQuery;

  const wsUpdateLocation = wsPresence?.updateLocation;
  const whiteboardViewers = wsPresence?.getWhiteboardViewers(boardId) ?? [];
  const cursorsEnabled = wsPresence?.realtimeEnabled ?? false;

  const whiteboardViewerEntries = useMemo<PresenceViewerEntry[]>(() => {
    const byUser = new Map<
      string,
      {
        user: (typeof whiteboardViewers)[0]['user'];
        online_at: string;
        away: boolean;
        count: number;
      }
    >();
    for (const viewer of whiteboardViewers) {
      const userId = viewer.user.id;
      if (!userId) continue;
      const existing = byUser.get(userId);
      if (existing) {
        existing.count++;
        if (!viewer.away) existing.away = false;
      } else {
        byUser.set(userId, {
          user: viewer.user,
          online_at: viewer.online_at,
          away: !!viewer.away,
          count: 1,
        });
      }
    }
    return Array.from(byUser.values()).map((v) => ({
      user: v.user,
      online_at: v.online_at,
      away: v.away,
      presenceCount: v.count,
    }));
  }, [whiteboardViewers]);

  const blobToDataURL = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to data URL'));
        }
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error('Failed to read file'));
      };
      reader.readAsDataURL(blob);
    });
  }, []);

  const loadImageFile = useCallback(
    async (fileId: string) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      if (requestedFileIdsRef.current.has(fileId)) return;
      requestedFileIdsRef.current.add(fileId);

      try {
        const { data, error } = await supabase.storage
          .from('workspaces')
          .createSignedUrl(fileId, 60 * 60);

        if (error || !data?.signedUrl) {
          console.error('Failed to create signed URL for file:', fileId, error);
          return;
        }

        const response = await fetch(data.signedUrl, { cache: 'no-store' });
        if (!response.ok) {
          console.error(
            'Failed to fetch image from signed URL:',
            fileId,
            response.statusText
          );
          return;
        }

        const blob = await response.blob();
        const mimeType = blob.type || 'image/png';
        const dataURL = await blobToDataURL(blob);

        const now = Date.now();
        const fileData: BinaryFileData = {
          id: fileId as BinaryFileData['id'],
          mimeType: mimeType as BinaryFileData['mimeType'],
          dataURL: dataURL as BinaryFileData['dataURL'],
          created: now,
          lastRetrieved: now,
        };

        api.addFiles([fileData]);
      } catch (error) {
        console.error(
          'Error loading image file for Excalidraw:',
          fileId,
          error
        );
      }
    },
    [supabase, blobToDataURL]
  );

  const ensureImageFilesLoaded = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      const api = excalidrawAPIRef.current;
      if (!api || elements.length === 0) return;

      const files = api.getFiles();
      const existingFileIds = new Set(
        Object.values(files).map((file) => file.id)
      );

      const fileIdsToLoad = new Set<string>();

      for (const element of elements) {
        if (element.type === 'image' && element.fileId) {
          if (!existingFileIds.has(element.fileId)) {
            fileIdsToLoad.add(element.fileId);
          }
        }
      }

      fileIdsToLoad.forEach((fileId) => {
        if (!requestedFileIdsRef.current.has(fileId)) {
          void loadImageFile(fileId);
        }
      });
    },
    [loadImageFile]
  );

  const handleExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI | null) => {
      excalidrawAPIRef.current = api;
    },
    []
  );

  const performSave = useCallback(async () => {
    const api = excalidrawAPIRef.current;
    if (!api) return;

    setSyncStatus('syncing');
    setLastSyncError(null);

    try {
      const elements = api.getSceneElements();
      const appState = api.getAppState();

      const essentialAppState: Partial<AppState> = {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      };

      const snapshot = {
        elements,
        appState: essentialAppState,
      };

      const { error } = await supabase
        .from('workspace_whiteboards')
        .update({
          snapshot: JSON.stringify(snapshot),
          updated_at: new Date().toISOString(),
        })
        .eq('id', boardId);

      if (error) throw error;

      lastSavedRef.current = JSON.stringify({ elements });
      pendingChangesRef.current = false;
      setSyncStatus('synced');
    } catch (error) {
      console.error('Save error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setLastSyncError(errorMessage);
      setSyncStatus('error');
      toast.error('Failed to save whiteboard', {
        description: 'Your changes may not be saved. Click to retry.',
        action: {
          label: 'Retry',
          onClick: () => performSave(),
        },
      });
    }
  }, [supabase, boardId]);

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    pendingChangesRef.current = true;
    setSyncStatus('syncing');

    autoSaveTimeoutRef.current = setTimeout(() => {
      performSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [performSave]);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      ensureImageFilesLoaded(elements);

      // Only compare elements (not appState which changes frequently)
      const currentState = JSON.stringify({
        elements: elements.filter((el) => !el.isDeleted),
      });
      const hasChanges = currentState !== lastSavedRef.current;

      // Broadcast element changes to collaborators
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

      // Update previous elements reference
      previousElementsRef.current = elements.map((el) => ({ ...el }));

      // Trigger auto-save if there are changes
      if (hasChanges) {
        triggerAutoSave();
      }
    },
    [
      broadcastElementChanges,
      broadcastSelectionChange,
      triggerAutoSave,
      ensureImageFilesLoaded,
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
    async (file: File) => {
      try {
        // Upload file to Supabase Storage
        const lastDotIndex = file.name.lastIndexOf('.');
        const fileName =
          lastDotIndex > 0 ? file.name.substring(0, lastDotIndex) : file.name;
        const fileExt =
          lastDotIndex > 0 ? file.name.substring(lastDotIndex + 1) : '';
        const fileId = `${Date.now()}-${fileName}`;
        const storagePath = fileExt
          ? `${wsId}/whiteboards/${boardId}/${fileId}.${fileExt}`
          : `${wsId}/whiteboards/${boardId}/${fileId}`;

        const { error } = await supabase.storage
          .from('workspaces')
          .upload(storagePath, file, {
            contentType: file.type || 'image/png',
            upsert: false,
          });

        if (error) {
          console.error('Failed to upload file:', error);
          toast.error('Failed to upload image');
          throw error;
        }

        // Return the file storage path - Excalidraw will use this to reference the file
        // The blob data will be retrieved from signed URL when the file needs to be rendered in the scene
        return storagePath;
      } catch (error) {
        console.error('Error in handleGenerateIdForFile:', error);
        toast.error('Failed to process image');
        throw error;
      }
    },
    [supabase, wsId, boardId]
  );

  const handleTitleClick = useCallback(() => {
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  }, []);

  const saveTitle = useCallback(
    async (newTitle: string) => {
      const trimmedTitle = newTitle.trim();
      if (!trimmedTitle || trimmedTitle === boardName) {
        setEditedTitle(boardName);
        return;
      }

      try {
        const { error } = await supabase
          .from('workspace_whiteboards')
          .update({
            title: trimmedTitle,
            updated_at: new Date().toISOString(),
          })
          .eq('id', boardId);

        if (error) throw error;
      } catch (error) {
        console.error('Failed to save title:', error);
        toast.error('Failed to update title');
        setEditedTitle(boardName);
      }
    },
    [supabase, boardId, boardName]
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setEditedTitle(newValue);

      // Debounced save
      if (titleSaveTimeoutRef.current) {
        clearTimeout(titleSaveTimeoutRef.current);
      }
      titleSaveTimeoutRef.current = setTimeout(() => {
        saveTitle(newValue);
      }, TITLE_SAVE_DEBOUNCE_MS);
    },
    [saveTitle]
  );

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
    // Clear pending debounce and save immediately
    if (titleSaveTimeoutRef.current) {
      clearTimeout(titleSaveTimeoutRef.current);
    }
    saveTitle(editedTitle);
  }, [saveTitle, editedTitle]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleInputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setEditedTitle(boardName);
        setIsEditingTitle(false);
      }
    },
    [boardName]
  );

  const SyncStatusIndicator = useMemo(() => {
    const config = {
      synced: {
        icon: CloudIcon,
        label: 'Synced',
        className: 'bg-dynamic-green/10 text-dynamic-green',
        tooltip: 'All changes saved',
      },
      syncing: {
        icon: Loader2Icon,
        label: 'Syncing...',
        className: 'bg-dynamic-blue/10 text-dynamic-blue',
        tooltip: 'Saving changes...',
      },
      error: {
        icon: CloudOffIcon,
        label: 'Sync failed',
        className: 'bg-dynamic-red/10 text-dynamic-red',
        tooltip: lastSyncError || 'Failed to save changes. Click to retry.',
      },
    };

    const { icon: Icon, label, className, tooltip } = config[syncStatus];

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={syncStatus === 'error' ? () => performSave() : undefined}
            className={cn(
              'flex cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
              className,
              syncStatus === 'error' && 'cursor-pointer hover:bg-dynamic-red/20'
            )}
          >
            <Icon
              className={cn(
                'h-3.5 w-3.5',
                syncStatus === 'syncing' && 'animate-spin'
              )}
            />
            <span>{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }, [syncStatus, lastSyncError, performSave]);

  // Track whiteboard location in workspace presence
  useEffect(() => {
    if (!wsUpdateLocation) return;
    wsUpdateLocation({ type: 'whiteboard', boardId });
  }, [wsUpdateLocation, boardId]);

  // Update Excalidraw collaborators when they change
  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (!api) return;

    api.updateScene({ collaborators });
  }, [collaborators]);

  // Initialize last saved state and previous elements on mount
  useEffect(() => {
    if (initialData) {
      lastSavedRef.current = JSON.stringify({
        elements: initialData.elements ?? [],
      });
      previousElementsRef.current =
        initialData.elements?.map((el) => ({
          ...el,
        })) ?? [];
    } else {
      lastSavedRef.current = JSON.stringify({ elements: [] });
      previousElementsRef.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  // Apply snapshot catchup when snapshot data changes
  useEffect(() => {
    if (!snapshotQuery.data || snapshotQuery.isLoading) return;

    const { snapshot, updated_at } = snapshotQuery.data;

    if (!updated_at || updated_at === lastSnapshotUpdatedAtRef.current) return;

    if (pendingChangesRef.current) return;

    if (!snapshot) return;

    try {
      const parsed = JSON.parse(snapshot) as {
        elements?: ExcalidrawElement[];
        appState?: Partial<AppState>;
      };

      const api = excalidrawAPIRef.current;
      if (!api) return;

      const nextElements = parsed.elements ?? [];

      api.updateScene({
        elements: nextElements,
      });

      previousElementsRef.current = nextElements.map((el) => ({ ...el }));
      lastSavedRef.current = JSON.stringify({ elements: nextElements });
      lastSnapshotUpdatedAtRef.current = updated_at;
    } catch (error) {
      console.error('Failed to apply whiteboard snapshot catchup:', error);
    }
  }, [snapshotQuery.data, snapshotQuery.isLoading]);

  // Clean up auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (titleSaveTimeoutRef.current) {
        clearTimeout(titleSaveTimeoutRef.current);
      }
    };
  }, []);

  // Handle keyboard shortcuts (Cmd+S / Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        // Force immediate save
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        performSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performSave]);

  // Refetch snapshot when connection is restored
  useEffect(() => {
    if (previousConnectionStatusRef.current === null) {
      previousConnectionStatusRef.current = isConnected;
      return;
    }

    if (!previousConnectionStatusRef.current && isConnected) {
      void refetchSnapshot();
    }

    previousConnectionStatusRef.current = isConnected;
  }, [isConnected, refetchSnapshot]);

  return (
    <div className="absolute inset-0 flex h-screen flex-col">
      <div className="h-17 md:hidden" />
      {/* Toolbar */}
      <div className="pointer-events-auto flex items-center gap-4 border-border border-b bg-background p-4">
        <Link href={`/${wsId}/whiteboards`}>
          <Button variant="ghost" size="sm">
            <ArrowLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </Link>

        {/* Board Title - Editable */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isEditingTitle ? (
            <Input
              ref={titleInputRef}
              value={editedTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="h-8 max-w-md font-semibold text-lg"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={handleTitleClick}
              className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
            >
              <h1 className="truncate font-semibold text-lg">{editedTitle}</h1>
              <PencilIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>

        {/* Collaboration Status */}
        <div className="flex items-center gap-2">
          {/* Sync Status */}
          {SyncStatusIndicator}

          {/* Connection Status (only when collaboration is enabled) */}
          {cursorsEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                    isConnected
                      ? 'bg-dynamic-green/10 text-dynamic-green'
                      : 'bg-dynamic-red/10 text-dynamic-red'
                  )}
                >
                  {isConnected ? (
                    <WifiIcon className="h-3.5 w-3.5" />
                  ) : (
                    <WifiOffIcon className="h-3.5 w-3.5" />
                  )}
                  <span>{isConnected ? 'Live' : 'Offline'}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isConnected
                  ? 'Connected - Changes sync in real-time'
                  : 'Disconnected - Changes will sync when reconnected'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Collaborator Avatars (only when collaboration is enabled) */}
          {cursorsEnabled && (
            <PresenceAvatarList
              viewers={whiteboardViewerEntries}
              currentUserId={currentUserId}
              maxDisplay={5}
              activeLabel={t('on_this_whiteboard')}
            />
          )}
        </div>
      </div>
      <div className="flex-1">
        {/* Excalidraw Editor */}
        {resolvedTheme ? (
          <Excalidraw
            excalidrawAPI={handleExcalidrawAPI}
            initialData={initialData}
            onChange={handleChange}
            onPointerUpdate={handlePointerUpdate}
            generateIdForFile={handleGenerateIdForFile}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            isCollaborating={cursorsEnabled}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <LoadingIndicator className="h-10 w-10" />
          </div>
        )}
      </div>
    </div>
  );
}
