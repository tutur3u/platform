'use client';

import { Sheet, SheetContent, SheetTitle } from '@tuturuuu/ui/sheet';
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
 * A full-height modal sheet for phones. It is a Radix dialog, so it traps and
 * restores focus, hides the call behind it from assistive technology and closes
 * on Escape or a tap on the scrim. It follows the visual viewport, so the
 * composer stays above the keyboard, and the handle drags it down to dismiss.
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
  const distance = useRef(0);
  const press = (event: PointerEvent<HTMLDivElement>) => {
    start.current = event.clientY;
    distance.current = 0;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    distance.current = Math.max(0, event.clientY - start.current);
    setDrag(distance.current);
  };
  const release = () => {
    const dragged = distance.current;
    start.current = null;
    distance.current = 0;
    setDrag(0);
    if (dragged >= DISMISS_DISTANCE) onDismiss();
  };
  return (
    <Sheet onOpenChange={(open) => !open && onDismiss()} open>
      <SheetContent
        aria-describedby={undefined}
        className={cn(
          'inset-x-0 gap-0 rounded-t-3xl p-0 pb-[env(keyboard-inset-height,0px)] [&>button:last-child]:hidden',
          height ? 'bottom-auto' : 'top-3 bottom-0 h-auto',
          drag !== 0 && 'transition-none'
        )}
        side="bottom"
        style={{
          ...(height
            ? { top: (offsetTop ?? 0) + TOP_GAP, height: height - TOP_GAP }
            : null),
          transform: drag ? `translateY(${drag}px)` : undefined,
        }}
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        <div
          aria-hidden="true"
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
          data-phone-sheet-handle
          onPointerCancel={release}
          onPointerDown={press}
          onPointerMove={move}
          onPointerUp={release}
        >
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}
