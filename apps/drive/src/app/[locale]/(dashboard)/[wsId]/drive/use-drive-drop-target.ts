'use client';

import { type DragEvent, useCallback, useRef, useState } from 'react';

export type DriveDropState = { kind: 'idle' } | { kind: 'over' };

const carriesFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

/**
 * Drag-and-drop handlers for an upload surface. Nested children fire their
 * own enter and leave events, so a depth counter decides when the drag has
 * really left the surface.
 */
export function useDriveDropTarget({
  disabled,
  onDrop,
}: {
  disabled: boolean;
  onDrop: (files: File[]) => void;
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
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) onDrop(files);
    },
  };

  return { handlers, state };
}
