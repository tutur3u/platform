'use client';

import { cn } from '@tuturuuu/utils/format';
import {
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

const DISMISS_DISTANCE = 96;
const TOP_GAP = 12;

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', onChange);
  viewport?.addEventListener('scroll', onChange);
  return () => {
    viewport?.removeEventListener('resize', onChange);
    viewport?.removeEventListener('scroll', onChange);
  };
}

/** `height,top` of the visual viewport, which shrinks while the keyboard is open. */
function readViewport() {
  const viewport = window.visualViewport;
  return viewport
    ? `${Math.round(viewport.height)},${Math.round(viewport.offsetTop)}`
    : '';
}

/**
 * A full-height bottom sheet for phones. It follows the visual viewport, so
 * the composer stays above the keyboard, and the handle drags it down to
 * dismiss it. Escape and the scrim dismiss it too.
 */
export function PhoneSheet({
  label,
  onDismiss,
  children,
}: {
  label: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const viewport = useSyncExternalStore(subscribe, readViewport, () => '');
  const [height, offsetTop] = viewport.split(',').map(Number);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const press = (event: PointerEvent<HTMLDivElement>) => {
    start.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current !== null)
      setDrag(Math.max(0, event.clientY - start.current));
  };
  const release = () => {
    const distance = drag;
    start.current = null;
    setDrag(0);
    if (distance >= DISMISS_DISTANCE) onDismiss();
  };
  return (
    <div
      className="fixed inset-x-0 z-40 flex flex-col justify-end"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss();
      }}
      style={height ? { top: offsetTop ?? 0, height } : { top: 0, bottom: 0 }}
    >
      <button
        aria-label={label}
        className="absolute inset-0 bg-foreground/30"
        onClick={onDismiss}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-label={label}
        className={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-3xl border-t bg-background pb-[env(keyboard-inset-height,0px)] shadow-lg',
          drag === 0 && 'motion-safe:transition-transform'
        )}
        role="dialog"
        style={{
          marginTop: TOP_GAP,
          transform: drag ? `translateY(${drag}px)` : undefined,
        }}
      >
        <div
          aria-hidden="true"
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
          onPointerCancel={release}
          onPointerDown={press}
          onPointerMove={move}
          onPointerUp={release}
        >
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>
        {children}
      </section>
    </div>
  );
}
