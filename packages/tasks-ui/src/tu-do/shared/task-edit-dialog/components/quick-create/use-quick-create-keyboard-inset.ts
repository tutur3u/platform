'use client';

import { type RefObject, useEffect } from 'react';

/** Read by the compact dialog's phone sheet classes. */
export const QUICK_CREATE_KEYBOARD_INSET_VAR = '--quick-create-keyboard-inset';

/**
 * Phones keep fixed elements on the layout viewport, so the on-screen keyboard
 * covers the bottom sheet's pinned Create footer. This follows the visual
 * viewport and publishes the covered height on the sheet as a CSS variable,
 * which lifts the sheet above the keyboard.
 */
export function useQuickCreateKeyboardInset(
  panelRef: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const sheet = panelRef.current?.closest<HTMLElement>(
      '[data-slot="dialog-content"]'
    );
    if (!viewport || !sheet) return;

    const update = () => {
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
      );
      sheet.style.setProperty(QUICK_CREATE_KEYBOARD_INSET_VAR, `${inset}px`);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      sheet.style.removeProperty(QUICK_CREATE_KEYBOARD_INSET_VAR);
    };
  }, [panelRef]);
}
