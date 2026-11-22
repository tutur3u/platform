'use client';

import { type DragEvent, useCallback, useRef, useState } from 'react';

export type DriveDropState = { kind: 'idle' } | { kind: 'over' };

const carriesFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

/**
 * The files in a drop, without folders. A folder dragged from the OS arrives
 * as a zero-byte File that fails to upload, so entries the browser reports
 * as directories are counted and left out.
 */
export function collectDroppedFiles(
  dataTransfer: Pick<DataTransfer, 'files' | 'items'>
) {
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length === 0 || typeof items[0]?.webkitGetAsEntry !== 'function') {
    return { files: Array.from(dataTransfer.files), skippedFolders: 0 };
  }
  const files: File[] = [];
  let skippedFolders = 0;
  for (const item of items) {
    if (item.kind !== 'file') continue;
    if (item.webkitGetAsEntry()?.isDirectory) {
      skippedFolders += 1;
      continue;
    }
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return { files, skippedFolders };
}

/**
 * Drag-and-drop handlers for an upload surface. Nested children fire their
 * own enter and leave events, so a depth counter decides when the drag has
 * really left the surface.
 */
export function useDriveDropTarget({
  disabled,
  onDrop,
  onFoldersSkipped,
}: {
  disabled: boolean;
  onDrop: (files: File[]) => void;
  onFoldersSkipped: (count: number) => void;
}) {
  const [state, setState] = useState<DriveDropState>({ kind: 'idle' });
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setState({ kind: 'idle' });
  }, []);

  const handlers = {
    onDragEnter: (event: DragEvent) => {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setState({ kind: 'over' });
    },
    onDragOver: (event: DragEvent) => {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event: DragEvent) => {
      if (disabled || !carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setState({ kind: 'idle' });
    },
    onDrop: (event: DragEvent) => {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      reset();
      const { files, skippedFolders } = collectDroppedFiles(event.dataTransfer);
      if (skippedFolders > 0) onFoldersSkipped(skippedFolders);
      if (files.length > 0) onDrop(files);
    },
  };

  return { handlers, state };
}
