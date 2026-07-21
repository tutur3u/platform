import { cn } from '@tuturuuu/utils/format';

/**
 * Hero entrance step.
 *
 * CSS-driven rather than framer-motion so the choreography runs on first paint,
 * before hydration — the hero is a server component and should not pull in a
 * motion runtime just to fade in. Spread onto the element: `{...rise(2)}`.
 *
 * Lives outside `reveal.tsx` so server components can call it: anything
 * exported from a `'use client'` module becomes a client reference.
 */
export function rise(step: number, className?: string) {
  return {
    className: cn('animate-rise-in', className),
    style: { animationDelay: `${step * 90}ms` },
  };
}
