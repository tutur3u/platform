'use client';

import { GripVertical } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  applyTaskPanelWidth,
  endTaskPanelResize,
  getTaskPanelMaxWidth,
  getTaskPanelWidth,
  saveTaskPanelWidth,
  startTaskPanelResize,
  TASK_PANEL_DEFAULT_WIDTH,
  TASK_PANEL_MIN_WIDTH,
} from './task-panel-width';

/**
 * The side panel's left edge: drag or use the arrow keys to resize it,
 * double-click to restore the default width. Same splitter as Meet's call panel.
 */
export function TaskPanelResizeHandle() {
  const t = useTranslations('ws-task-boards.dialog');
  const [width, setWidth] = useState(TASK_PANEL_DEFAULT_WIDTH);
  const drag = useRef<{ start: number; width: number; x: number } | null>(null);
  useEffect(() => {
    // The window bounds the width, so re-read it when the window resizes.
    const sync = () => setWidth(getTaskPanelWidth());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const save = (next: number) => setWidth(saveTaskPanelWidth(next));
  const stop = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setWidth(endTaskPanelResize(current.width));
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: Interactive splitter with a grip and keyboard range controls.
    <div
      role="separator"
      tabIndex={0}
      aria-label={t('resize_panel')}
      aria-orientation="vertical"
      aria-valuemin={TASK_PANEL_MIN_WIDTH}
      aria-valuemax={
        typeof window === 'undefined' ? undefined : getTaskPanelMaxWidth()
      }
      aria-valuenow={width}
      className="group absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none items-center justify-center outline-none hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring sm:flex"
      onDoubleClick={() => save(TASK_PANEL_DEFAULT_WIDTH)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        save(width + (event.key === 'ArrowLeft' ? 24 : -24));
      }}
      onLostPointerCapture={stop}
      onPointerCancel={stop}
      onPointerDown={(event) => {
        const start = getTaskPanelWidth();
        drag.current = { start, width: start, x: event.clientX };
        event.currentTarget.setPointerCapture(event.pointerId);
        startTaskPanelResize();
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        // Straight from the pointer event, so the edge stays under the cursor.
        current.width = applyTaskPanelWidth(
          current.start + current.x - event.clientX
        );
      }}
      onPointerUp={stop}
    >
      <GripVertical className="h-8 w-3 rounded border bg-background text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </div>
  );
}
