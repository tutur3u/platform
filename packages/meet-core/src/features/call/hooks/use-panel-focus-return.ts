'use client';

import { type RefObject, useEffect, useRef } from 'react';

/**
 * When a panel closes and took focus with it (focus fell back to the body),
 * focus returns to whichever of its triggers is rendered at this width. A
 * trigger hidden with `display: none` has no client rects and is skipped.
 */
export function usePanelFocusReturn(
  open: boolean,
  enabled: boolean,
  first: RefObject<HTMLElement | null>,
  second: RefObject<HTMLElement | null>
) {
  const wasOpen = useRef(open);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!enabled || !closed) return;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    [first.current, second.current]
      .find((trigger) => !!trigger && trigger.getClientRects().length > 0)
      ?.focus();
  }, [open, enabled, first, second]);
}
