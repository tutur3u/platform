'use client';

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import './excalidraw-overrides.css';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
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
import { useWhiteboardCollaboration } from '@/hooks/useWhiteboardCollaboration';
import { mergeElements } from '@/utils/excalidraw-helper';

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
    files?: BinaryFiles;
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

  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Inline title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(boardName);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const lastSavedRef = useRef<string | null>(null);
  const previousElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef(false);

  // Track whiteboard location in workspace presence (stable function ref)
  const wsUpdateLocation = wsPresence?.updateLocation;
  useEffect(() => {
    if (!wsUpdateLocation) return;
    wsUpdateLocation({ type: 'whiteboard', boardId });
  }, [wsUpdateLocation, boardId]);

  // Build viewer entries for the shared PresenceAvatarList component
  const whiteboardViewers = wsPresence?.getWhiteboardViewers(boardId) ?? [];
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

  // Helper to deep clone elements array
  const cloneElements = useCallback(
    (elements: readonly ExcalidrawElement[]): ExcalidrawElement[] => {
      return elements.map((el) => ({ ...el }));
    },
    []
  );

  // Set up collaboration (cursor + element sync only — presence is handled by workspace provider)
  const {
    collaborators,
    isConnected,
    currentUserId,
    broadcastElementChanges,
    broadcastCursorPosition,
  } = useWhiteboardCollaboration({
    boardId,
    wsId,
    enabled: true,
    externalPresenceState: wsPresence ? wsPresence.presenceState : undefined,
    externalCurrentUserId: wsPresence?.currentUserId,
    onRemoteElementsChange: useCallback(
      (remoteElements: ExcalidrawElement[]) => {
        if (!excalidrawAPI) return;

        const currentElements = excalidrawAPI.getSceneElements();
        const mergedElements = mergeElements(
          [...currentElements],
          remoteElements
        );

        previousElementsRef.current = cloneElements(mergedElements);

        // Update the scene with merged elements
        excalidrawAPI.updateScene({ elements: mergedElements });
      },
      [excalidrawAPI, cloneElements]
    ),
    onError: useCallback((error: Error) => {
      console.error('Collaboration error:', error);
      toast.error('Collaboration connection issue. Changes may not sync.');
    }, []),
  });

  // Update Excalidraw collaborators when they change
  useEffect(() => {
    if (!excalidrawAPI) return;
    excalidrawAPI.updateScene({ collaborators });
  }, [excalidrawAPI, collaborators]);

  // Initialize last saved state and previous elements on mount
  useEffect(() => {
    if (initialData) {
      lastSavedRef.current = JSON.stringify({
        elements: initialData.elements ?? [],
        files: initialData.files ?? {},
      });
      previousElementsRef.current = cloneElements(initialData.elements ?? []);
    } else {
      lastSavedRef.current = JSON.stringify({ elements: [], files: {} });
      previousElementsRef.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, cloneElements]);

  // Perform the actual save to database
  const performSave = useCallback(async () => {
    if (!excalidrawAPI) return;

    setSyncStatus('syncing');
    setLastSyncError(null);

    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      const essentialAppState: Partial<AppState> = {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      };

      const snapshot = {
        elements,
        appState: essentialAppState,
        files,
      };

      const { error } = await supabase
        .from('workspace_whiteboards')
        .update({
          snapshot: JSON.stringify(snapshot),
          updated_at: new Date().toISOString(),
        })
        .eq('id', boardId);

      if (error) throw error;

      lastSavedRef.current = JSON.stringify({ elements, files });
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
  }, [excalidrawAPI, supabase, boardId]);

  // Auto-save function with debounce
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

  // Change detection and collaboration broadcast via onChange callback
  const handleChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      _appState: AppState,
      files: BinaryFiles
    ) => {
      // Only compare elements and files (not appState which changes frequently)
      const currentState = JSON.stringify({
        elements: elements.filter((el) => !el.isDeleted),
        files,
      });
      const hasChanges = currentState !== lastSavedRef.current;

      // Broadcast element changes to collaborators
      if (previousElementsRef.current.length > 0 || elements.length > 0) {
        broadcastElementChanges(previousElementsRef.current, elements);
      }

      // Update previous elements reference with deep clone
      previousElementsRef.current = cloneElements(elements);

      // Trigger auto-save if there are changes
      if (hasChanges) {
        triggerAutoSave();
      }
    },
    [broadcastElementChanges, triggerAutoSave, cloneElements]
  );

  // Handle pointer/cursor updates
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

  // Handle image upload
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

        // Return the ID - Excalidraw will use this to reference the file
        // The file URL will be stored in Excalidraw's files object
        return fileId;
      } catch (error) {
        console.error('Error in handleGenerateIdForFile:', error);
        toast.error('Failed to process image');
        throw error;
      }
    },
    [supabase, wsId, boardId]
  );

  // Title editing handlers
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

  // Sync status indicator component
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

  return (
    <div className="absolute inset-0 flex h-screen flex-col">
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

          {/* Connection Status */}
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

          {/* Collaborator Avatars */}
          <PresenceAvatarList
            viewers={whiteboardViewerEntries}
            currentUserId={currentUserId}
            maxDisplay={5}
            activeLabel={t('on_this_whiteboard')}
          />
        </div>
      </div>
      <div className="flex-1">
        {/* Excalidraw Editor */}
        {resolvedTheme ? (
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            initialData={initialData}
            onChange={handleChange}
            onPointerUpdate={handlePointerUpdate}
            generateIdForFile={handleGenerateIdForFile}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            isCollaborating={true}
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
