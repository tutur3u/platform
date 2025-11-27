'use client';

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import { ArrowLeftIcon } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  // Initialize last saved state on mount (intentionally run once)
  useEffect(() => {
    if (initialData) {
      lastSavedRef.current = JSON.stringify({
        elements: initialData.elements ?? [],
        files: initialData.files ?? {},
      });
    } else {
      lastSavedRef.current = JSON.stringify({ elements: [], files: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  // Change detection via onChange callback
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
      setHasUnsavedChanges(currentState !== lastSavedRef.current);
    },
    []
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
    <div className="relative h-full w-full">
      {/* Toolbar */}
      <div className="pointer-events-auto absolute top-0 left-0 z-1000 flex gap-4 px-16 py-4">
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
      </div>

      {/* Excalidraw Editor */}
      {resolvedTheme ? (
        <div className="-inset-4 absolute h-screen w-full bg-red-300">
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            initialData={initialData}
            onChange={handleChange}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <LoadingIndicator className="h-10 w-10" />
        </div>
      )}
    </div>
  );
}
