import { toast } from '@tuturuuu/ui/sonner';
import type {
  StoredWhiteboardSnapshot,
  WhiteboardAssets,
  WhiteboardPersistence,
} from '@tuturuuu/whiteboard';
import { optimizeWhiteboardImageUpload } from './image-upload';

interface BoardRef {
  wsId: string;
  boardId: string;
}

type FetchLike = typeof fetch;

const boardUrl = ({ wsId, boardId }: BoardRef) =>
  `/api/v1/workspaces/${wsId}/whiteboards/${boardId}`;

/** Stores the board snapshot through the workspace whiteboards API. */
export function createWorkspaceWhiteboardPersistence(
  board: BoardRef,
  fetchImpl: FetchLike = (...args) => fetch(...args)
): WhiteboardPersistence & Required<Pick<WhiteboardPersistence, 'load'>> {
  return {
    async load() {
      const response = await fetchImpl(boardUrl(board), { cache: 'no-store' });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        console.error('Failed to fetch whiteboard snapshot:', error);
        throw new Error(error?.error || 'Failed to fetch whiteboard snapshot');
      }

      const payload = (await response.json()) as {
        whiteboard?: { snapshot?: unknown; updated_at?: string | null };
      };

      return {
        snapshot: (payload.whiteboard?.snapshot ??
          null) as StoredWhiteboardSnapshot['snapshot'],
        revision: payload.whiteboard?.updated_at ?? null,
      };
    },
    async save(snapshot) {
      const revision = new Date().toISOString();
      const response = await fetchImpl(boardUrl(board), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ snapshot, updated_at: revision }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Failed to save whiteboard');
      }

      return { revision };
    },
  };
}

/** Uploads board images to workspace storage and resolves signed read urls. */
export function createWorkspaceWhiteboardAssets(
  board: BoardRef,
  fetchImpl: FetchLike = (...args) => fetch(...args)
): WhiteboardAssets {
  const imageUrl = `${boardUrl(board)}/image-url`;

  return {
    async upload(file) {
      try {
        const optimizedFile = await optimizeWhiteboardImageUpload(file);
        const uploadUrlResponse = await fetchImpl(imageUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ filename: optimizedFile.name }),
        });

        if (!uploadUrlResponse.ok) {
          const error = await uploadUrlResponse.json().catch(() => null);
          console.error('Failed to generate whiteboard upload URL:', error);
          toast.error('Failed to upload image');
          throw new Error(error?.error || 'Failed to generate upload URL');
        }

        const uploadData = (await uploadUrlResponse.json()) as {
          signedUrl?: string;
          token?: string;
          path?: string;
        };

        if (!uploadData.signedUrl || !uploadData.path || !uploadData.token) {
          toast.error('Failed to upload image');
          throw new Error('Missing upload URL');
        }

        const { uploadToStorageUrl } = await import('@/lib/api-fetch');
        await uploadToStorageUrl(
          uploadData.signedUrl,
          optimizedFile,
          uploadData.token
        );

        return uploadData.path;
      } catch (error) {
        console.error('Error in handleGenerateIdForFile:', error);
        toast.error('Failed to process image');
        throw error;
      }
    },
    async resolveUrl(fileId) {
      const response = await fetchImpl(
        `${imageUrl}?path=${encodeURIComponent(fileId)}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        console.error('Failed to create signed URL for file:', fileId, error);
        return null;
      }

      const data = (await response.json()) as { signedUrl?: string };
      return data.signedUrl ?? null;
    },
  };
}
