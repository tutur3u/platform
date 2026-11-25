import {
  createWhiteboardImageUploadUrl,
  getWhiteboardImageSignedUrl,
  getWorkspaceWhiteboard,
  updateWorkspaceWhiteboard,
} from '@tuturuuu/internal-api/whiteboards';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import { uploadFileWithSignedUrl } from '@tuturuuu/internal-api/storage';
import { toast } from '@tuturuuu/ui/sonner';
import {
  parseStoredWhiteboardSnapshot,
  type WhiteboardAssets,
  type WhiteboardPersistence,
} from '@tuturuuu/whiteboard';
import { optimizeWhiteboardImageUpload } from './image-upload';

interface BoardRef {
  wsId: string;
  boardId: string;
}

/** Stores the board snapshot through the workspace whiteboards API. */
export function createWorkspaceWhiteboardPersistence(
  board: BoardRef,
  options?: InternalApiClientOptions
): WhiteboardPersistence & Required<Pick<WhiteboardPersistence, 'load'>> {
  return {
    async load() {
      const whiteboard = await getWorkspaceWhiteboard(
        board.wsId,
        board.boardId,
        options
      ).catch((error) => {
        console.error('Failed to fetch whiteboard snapshot:', error);
        throw error;
      });

      return {
        snapshot: parseStoredWhiteboardSnapshot(whiteboard.snapshot),
        revision: whiteboard.updated_at ?? null,
      };
    },
    async save(snapshot) {
      const revision = new Date().toISOString();
      await updateWorkspaceWhiteboard(
        board.wsId,
        board.boardId,
        { snapshot, updated_at: revision },
        options
      );

      return { revision };
    },
  };
}

/** Uploads board images to workspace storage and resolves signed read urls. */
export function createWorkspaceWhiteboardAssets(
  board: BoardRef,
  messages: { uploadFailed: string; processFailed: string },
  options?: InternalApiClientOptions
): WhiteboardAssets {
  return {
    async upload(file) {
      try {
        const optimizedFile = await optimizeWhiteboardImageUpload(file);
        const upload = await createWhiteboardImageUploadUrl(
          board.wsId,
          board.boardId,
          optimizedFile.name,
          options
        ).catch((error) => {
          console.error('Failed to generate whiteboard upload URL:', error);
          toast.error(messages.uploadFailed);
          throw error;
        });

        if (!upload.signedUrl || !upload.path || !upload.token) {
          toast.error(messages.uploadFailed);
          throw new Error('Missing upload URL');
        }

        const uploaded = await uploadFileWithSignedUrl(
          optimizedFile,
          {
            ...upload,
            signedUrl: upload.signedUrl,
            path: upload.path,
            fullPath: upload.fullPath ?? null,
          },
          options?.fetch ?? ((...args) => fetch(...args))
        );

        return uploaded.path;
      } catch (error) {
        console.error('Error uploading whiteboard image:', error);
        toast.error(messages.processFailed);
        throw error;
      }
    },
    resolveUrl(fileId) {
      return getWhiteboardImageSignedUrl(
        board.wsId,
        board.boardId,
        fileId,
        options
      );
    },
  };
}
