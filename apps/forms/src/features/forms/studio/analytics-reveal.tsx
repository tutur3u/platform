'use client';

import { cn } from '@tuturuuu/utils/format';
import { Children, type ReactNode } from 'react';

/** Gap between neighbouring cards, in milliseconds. */
const STEP_MS = 60;

/**
 * Caps the cascade so a long dashboard does not end with cards arriving
 * seconds after the first. Past this point everything shares the last delay.
 */
const MAX_STEPS = 8;

/**
 * A grid whose children arrive one after another rather than all at once.
 *
 * A dashboard that appears in a single frame reads as a flash; staggering lets
 * the eye follow the layout in the order it should be read. The delay is
 * capped because the point is rhythm, not a queue — a card arriving a second
 * in feels broken rather than choreographed.
 *
 * Wrapping children here rather than at each call site keeps the delays
 * sequential automatically: a card inserted in the middle renumbers everything
 * after it, where hand-written indices would silently repeat one.
 *
 * `motion-safe:` rather than a JS media query, so a viewer who asked for
 * reduced motion never receives the animation classes and the grid is simply
 * there. `fill-mode-backwards` holds the pre-animation state during the delay,
 * without which a delayed card flashes at full opacity first.
 */
export function AnalyticsRevealGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {Children.map(children, (child, index) => {
        if (child == null || child === false) return child;

        return (
          <div
            className={cn(
              'motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:duration-500 motion-safe:ease-out'
            )}
            style={{
              animationDelay: `${Math.min(index, MAX_STEPS) * STEP_MS}ms`,
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
