'use client';

import { type RefObject, useEffect, useRef } from 'react';

const TURN_MS = 800;
const DEGREES_PER_MS = 360 / TURN_MS;
// Starts at roughly the spin's speed and decelerates to rest.
const SETTLE_EASING = 'cubic-bezier(0.3, 0.6, 0.4, 1)';

/** Remaining rotation and duration that bring a spin at `angle` to rest. */
export function getSettleMotion(angle: number) {
  const remaining = 360 - (((angle % 360) + 360) % 360);
  // Too little room to slow down reads as a snap; finish one more turn.
  const distance = remaining < 90 ? remaining + 360 : remaining;
  const duration = Math.min(
    Math.max((2 * distance) / DEGREES_PER_MS, 350),
    1000
  );
  return { distance, duration };
}

/**
 * Spin while `active`, then ease back to rest from the current angle instead of
 * snapping. Reduced-motion users get no rotation.
 */
export function useSettlingSpin(
  target: RefObject<Element | null>,
  active: boolean
) {
  const spin = useRef<Animation | null>(null);

  useEffect(() => {
    const element = target.current;
    if (!element || typeof element.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    if (active) {
      if (spin.current) return;
      for (const animation of element.getAnimations()) animation.cancel();
      spin.current = element.animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: TURN_MS, easing: 'linear', iterations: Infinity }
      );
      return;
    }

    const running = spin.current;
    if (!running) return;
    spin.current = null;
    const elapsed = Number(running.currentTime ?? 0);
    const angle = (elapsed % TURN_MS) * DEGREES_PER_MS;
    const { distance, duration } = getSettleMotion(angle);
    running.cancel();
    element.animate(
      [
        { transform: `rotate(${angle}deg)` },
        { transform: `rotate(${angle + distance}deg)` },
      ],
      { duration, easing: SETTLE_EASING }
    );
  }, [active, target]);

  useEffect(
    () => () => {
      spin.current?.cancel();
    },
    []
  );
}
