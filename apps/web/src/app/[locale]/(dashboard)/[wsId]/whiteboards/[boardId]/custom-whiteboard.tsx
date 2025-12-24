'use client';

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import type {
  AppState,
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from '@excalidraw/excalidraw/types';
import { ArrowLeftIcon, WifiIcon, WifiOffIcon } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { UserPresenceAvatars } from '@tuturuuu/ui/tu-do/shared/user-presence-avatars';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
  initialData?: {
    elements?: ExcalidrawElement[];
    appState?: Partial<AppState>;
    files?: BinaryFiles;
  };
}

// Auto-save debounce interval (5 seconds)
const AUTO_SAVE_DEBOUNCE_MS = 5000;

export function CustomWhiteboard({
  wsId,
  boardId,
  initialData,
}: CustomWhiteboardProps) {
  const supabase = createClient();
  const { resolvedTheme } = useTheme();

  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const lastSavedRef = useRef<string | null>(null);
  const previousElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to deep clone elements array
  const cloneElements = useCallback(
    (elements: readonly ExcalidrawElement[]): ExcalidrawElement[] => {
      return elements.map((el) => ({ ...el }));
    },
    []
  );

  // Set up collaboration
  const {
    collaborators,
    presenceState,
    isConnected,
    currentUserId,
    broadcastElementChanges,
    broadcastCursorPosition,
  } = useWhiteboardCollaboration({
    boardId,
    wsId,
    enabled: true,
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

  // Convert collaborators to Excalidraw format
  const excalidrawCollaborators = useMemo(() => {
    const collabMap = new Map<SocketId, Collaborator>();

    collaborators.forEach((collab, id) => {
      if (id !== currentUserId) {
        collabMap.set(id as SocketId, {
          username: collab.displayName,
          avatarUrl: collab.avatarUrl,
          color: {
            background: collab.color,
            stroke: collab.color,
          },
          // Add pointer if cursor is available and not off-screen
          ...(collab.cursor &&
            collab.cursor.x > -100 && {
              pointer: {
                x: collab.cursor.x,
                y: collab.cursor.y,
                tool: collab.cursor.tool === 'laser' ? 'laser' : 'pointer',
              },
            }),
        });
      }
    });

    return collabMap;
  }, [collaborators, currentUserId]);

  // Update Excalidraw collaborators when they change
  useEffect(() => {
    if (!excalidrawAPI) return;
    excalidrawAPI.updateScene({ collaborators: excalidrawCollaborators });
  }, [excalidrawAPI, excalidrawCollaborators]);

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

  // Auto-save function
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      // Will trigger save via the save function
      if (hasUnsavedChanges && excalidrawAPI) {
        // Trigger save silently
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

        supabase
          .from('workspace_whiteboards')
          .update({
            snapshot: JSON.stringify(snapshot),
            updated_at: new Date().toISOString(),
          })
          .eq('id', boardId)
          .then(({ error }) => {
            if (!error) {
              lastSavedRef.current = JSON.stringify({ elements, files });
              setHasUnsavedChanges(false);
            }
          });
      }
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [hasUnsavedChanges, excalidrawAPI, supabase, boardId]);

  // Clean up auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

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
      setHasUnsavedChanges(hasChanges);

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

  // Save function
  const save = useCallback(async () => {
    if (!excalidrawAPI || isSaving) return;

    setIsSaving(true);

    // Generate thumbnail using exportToBlob
    // const generateThumbnail = async (): Promise<Blob | null> => {
    //   const elements = excalidrawAPI.getSceneElements();
    //   if (elements.length === 0) return null;

    //   try {
    //     const { exportToBlob } = await import('@excalidraw/excalidraw');
    //     return await exportToBlob({
    //       elements,
    //       appState: excalidrawAPI.getAppState(),
    //       files: excalidrawAPI.getFiles(),
    //       mimeType: 'image/png',
    //       quality: 0.8,
    //       exportPadding: 16,
    //     });
    //   } catch (error) {
    //     console.error('Failed to generate thumbnail:', error);
    //     return null;
    //   }
    // };

    // const generateFileName = (name: string) => {
    //   const now = new Date();
    //   const year = now.getFullYear();
    //   const month = String(now.getMonth() + 1).padStart(2, '0');
    //   const day = String(now.getDate()).padStart(2, '0');
    //   const hours = String(now.getHours()).padStart(2, '0');
    //   const minutes = String(now.getMinutes()).padStart(2, '0');
    //   const seconds = String(now.getSeconds()).padStart(2, '0');

    //   return `${year}${month}${day}-${hours}-${minutes}-${seconds}-${name}`;
    // };

    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      // let thumbnailUrl: string | null = null;

      // Generate and upload thumbnail if there are elements
      // if (elements.length > 0) {
      // const thumbnailBlob = await generateThumbnail();
      // if (thumbnailBlob) {
      // const thumbnailFileName = generateFileName(`${boardId}.png`);
      // const thumbnailFile = new File([thumbnailBlob], thumbnailFileName, {
      //   type: 'image/png',
      // });

      // const { error: thumbnailError } = await supabase.storage
      //   .from('workspaces')
      //   .upload(
      //     `${wsId}/whiteboards/${boardId}/${thumbnailFileName}`,
      //     thumbnailFile
      //   );

      // if (thumbnailError) {
      //   console.error('Thumbnail upload error:', thumbnailError);
      // } else {
      //   const { data: urlData } = supabase.storage
      //     .from('workspaces')
      //     .getPublicUrl(
      //       `${wsId}/whiteboards/${boardId}/${thumbnailFileName}`
      //     );
      //   thumbnailUrl = urlData.publicUrl;
      // }
      // }
      // }

      // Filter appState to only include essential properties
      const essentialAppState: Partial<AppState> = {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      };

      const snapshot = {
        elements,
        appState: essentialAppState,
        files,
      };

      const updateData: Record<string, unknown> = {
        snapshot: JSON.stringify(snapshot),
        updated_at: new Date().toISOString(),
      };

      // if (thumbnailUrl) {
      //   updateData.thumbnail_url = thumbnailUrl;
      // }

      const { error: updateError } = await supabase
        .from('workspace_whiteboards')
        .update(updateData)
        .eq('id', boardId);

      if (updateError) throw updateError;

      // Update the last saved reference
      lastSavedRef.current = JSON.stringify({
        elements,
        files,
      });
      setHasUnsavedChanges(false);

      toast.success('Whiteboard saved successfully');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save whiteboard');
    } finally {
      setIsSaving(false);
    }
  }, [excalidrawAPI, isSaving, boardId, supabase]);

  return (
    <TooltipProvider>
      <div className="relative h-full w-full">
        {/* Toolbar */}
        <div className="pointer-events-auto absolute top-0 left-0 z-1000 flex items-center gap-4 px-16 py-4">
          <Link href={`/${wsId}/whiteboards`}>
            <Button variant="ghost">
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <Button
            variant="default"
            onClick={save}
            disabled={!hasUnsavedChanges || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>

          {/* Collaboration Status */}
          <div className="flex items-center gap-2">
            {/* Connection Status */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                    isConnected
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}
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
            <UserPresenceAvatars
              presenceState={presenceState}
              currentUserId={currentUserId}
              maxDisplay={5}
              avatarClassName="h-7 w-7"
            />
          </div>
        </div>

        {/* Excalidraw Editor */}
        {resolvedTheme ? (
          <div className="absolute -inset-4 h-screen w-full">
            <Excalidraw
              excalidrawAPI={(api) => setExcalidrawAPI(api)}
              initialData={initialData}
              onChange={handleChange}
              onPointerUpdate={handlePointerUpdate}
              theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <LoadingIndicator className="h-10 w-10" />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
