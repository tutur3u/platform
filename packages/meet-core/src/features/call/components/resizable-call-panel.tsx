'use client';

import { GripVertical } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  type ReactNode,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

function subscribeViewport(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}
const panelMaximum = () =>
  Math.max(280, Math.min(720, Math.floor(window.innerWidth * 0.6)));

export function ResizableCallPanel({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const t = useTranslations('meet.call');
  const [width, setWidth] = useState(360);
  const panelId = useId();
  const maximum = useSyncExternalStore(
    subscribeViewport,
    panelMaximum,
    () => 720
  );
  const effectiveWidth = Math.min(width, maximum);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resize = (next: number) =>
    setWidth(Math.max(280, Math.min(next, maximum)));
  return (
    <aside
      id={panelId}
      aria-label={label}
      style={{ '--call-panel-width': `${effectiveWidth}px` } as CSSProperties}
      className="relative flex max-h-[45dvh] min-h-0 w-full shrink-0 flex-col border-l bg-background md:max-h-none md:w-(--call-panel-width) md:max-w-[60vw]"
    >
      {/* biome-ignore lint/a11y/useSemanticElements: Interactive splitter with a grip and keyboard range controls. */}
      <div
        role="separator"
        tabIndex={0}
        aria-label={t('resize_panel', { panel: label })}
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={maximum}
        aria-controls={panelId}
        aria-valuenow={Math.round(effectiveWidth)}
        className="group absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none items-center justify-center outline-none hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring md:flex"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, width: effectiveWidth };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (drag.current)
            resize(drag.current.width + drag.current.x - event.clientX);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          resize(effectiveWidth + (event.key === 'ArrowLeft' ? 24 : -24));
        }}
      >
        <GripVertical className="h-8 w-3 rounded border bg-background text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
      </div>
      {children}
    </aside>
  );
}
