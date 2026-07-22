'use client';

import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';

/**
 * Pointer-tracking spotlight for the bento grid.
 *
 * Writes the cursor position to CSS custom properties on the container; the
 * cards read them to place a radial highlight on their own border. Doing it
 * with CSS variables means one listener for the whole grid and zero React
 * re-renders while the pointer moves.
 */
export function SpotlightGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (frame.current !== null) return;

    const { clientX, clientY } = event;

    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const node = ref.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      node.style.setProperty('--spot-x', `${clientX - rect.left}px`);
      node.style.setProperty('--spot-y', `${clientY - rect.top}px`);
      node.style.setProperty('--spot-opacity', '1');
    });
  }, []);

  const handlePointerLeave = useCallback(() => {
    ref.current?.style.setProperty('--spot-opacity', '0');
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );

  return (
    <div
      className={cn('group/grid relative', className)}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      ref={ref}
      style={
        {
          '--spot-x': '50%',
          '--spot-y': '0px',
          '--spot-opacity': '0',
        } as React.CSSProperties
      }
    >
      {children}

      {/* The light itself: one element floating above the cards, additive so it
          reads as illumination rather than a grey wash. Hidden on touch, where
          there is no cursor to follow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 hidden opacity-[var(--spot-opacity)] mix-blend-plus-lighter transition-opacity duration-500 md:block"
        style={{
          background:
            'radial-gradient(320px circle at var(--spot-x) var(--spot-y), color-mix(in oklab, var(--foreground) 7%, transparent), transparent 70%)',
        }}
      />
    </div>
  );
}
