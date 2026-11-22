import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';

/** The action dialog on top of the browser; at most one at a time. */
export type DriveDialogState =
  | { kind: 'none' }
  | { kind: 'new-folder' }
  | { kind: 'rename'; item: StorageObject }
  | { kind: 'move'; items: StorageObject[] }
  | { kind: 'delete'; items: StorageObject[] }
  | { kind: 'share-file'; item: StorageObject }
  | { kind: 'share-folder'; item: StorageObject };

/**
 * The full-screen viewer is a separate machine so an action dialog can open
 * over it. It tracks the file by id because renames and deletes reorder the
 * loaded list.
 */
export type DrivePreviewState =
  | { kind: 'closed' }
  | { kind: 'open'; fileId: string };

export function resolvePreviewIndex(
  preview: DrivePreviewState,
  files: StorageObject[]
) {
  if (preview.kind === 'closed') return -1;
  return files.findIndex((file) => file.id === preview.fileId);
}
