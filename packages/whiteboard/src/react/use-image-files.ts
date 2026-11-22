import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import { type MutableRefObject, useCallback, useRef } from 'react';
import type { WhiteboardAssets } from '../adapters';
import type { ExcalidrawElement } from '../types';

function blobToDataURL(blob: Blob): Promise<string> {
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
}

/**
 * Fetches image files the scene references but the editor does not hold yet,
 * once per file id.
 */
export function useImageFiles(
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>,
  assets?: WhiteboardAssets
) {
  const requestedFileIdsRef = useRef<Set<string>>(new Set());

  const loadImageFile = useCallback(
    async (fileId: string) => {
      const api = apiRef.current;
      if (!api || !assets) return;

      if (requestedFileIdsRef.current.has(fileId)) return;
      requestedFileIdsRef.current.add(fileId);

      try {
        const url = await assets.resolveUrl(fileId);
        if (!url) return;

        const imageResponse = await fetch(url, { cache: 'no-store' });
        if (!imageResponse.ok) {
          console.error(
            'Failed to fetch image from signed URL:',
            fileId,
            imageResponse.statusText
          );
          return;
        }

        const blob = await imageResponse.blob();
        const now = Date.now();

        api.addFiles([
          {
            id: fileId as BinaryFileData['id'],
            mimeType: (blob.type || 'image/png') as BinaryFileData['mimeType'],
            dataURL: (await blobToDataURL(blob)) as BinaryFileData['dataURL'],
            created: now,
            lastRetrieved: now,
          },
        ]);
      } catch (error) {
        console.error(
          'Error loading image file for Excalidraw:',
          fileId,
          error
        );
      }
    },
    [apiRef, assets]
  );

  return useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      const api = apiRef.current;
      if (!api || !assets || elements.length === 0) return;

      const existingFileIds = new Set(
        Object.values(api.getFiles()).map((file) => file.id)
      );

      for (const element of elements) {
        if (
          element.type === 'image' &&
          element.fileId &&
          !existingFileIds.has(element.fileId) &&
          !requestedFileIdsRef.current.has(element.fileId)
        ) {
          void loadImageFile(element.fileId);
        }
      }
    },
    [apiRef, assets, loadImageFile]
  );
}
