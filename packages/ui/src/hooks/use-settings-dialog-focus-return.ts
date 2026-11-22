'use client';

import { createContext, useCallback, useLayoutEffect, useRef } from 'react';
import {
  focusSidebarRevealTrigger,
  SIDEBAR_REVEAL_TRIGGER_SELECTOR,
} from '../components/ui/custom/use-sidebar-overlay-close';

export const SettingsDialogFocusContext = createContext<
  ((event: Event) => void) | undefined
>(undefined);

export function useSettingsDialogFocusReturn(open: boolean) {
  const isOpen = useRef(open);
  const focus = useRef<{
    origin: HTMLElement;
    sidebar: HTMLElement | null;
  } | null>(null);
  useLayoutEffect(() => {
    isOpen.current = open;
  }, [open]);

  const rememberFocus = useCallback((origin = document.activeElement) => {
    if (isOpen.current) return;
    focus.current =
      origin instanceof HTMLElement && origin !== document.body
        ? { origin, sidebar: origin.closest('[data-slot="app-sidebar"]') }
        : null;
  }, []);

  const restoreFocus = useCallback((event: Event) => {
    if (isOpen.current || !focus.current) return;
    const { origin, sidebar } = focus.current;
    focus.current = null;
    event.preventDefault();
    // A changed sidebar mode can replace its controls on the closing render.
    requestAnimationFrame(() => {
      if (isOpen.current) return;
      const target = [
        origin,
        sidebar?.querySelector<HTMLElement>(SIDEBAR_REVEAL_TRIGGER_SELECTOR),
        sidebar?.querySelector<HTMLElement>(
          '[data-slot="sidebar-settings-button"]'
        ),
      ].find(
        (control) =>
          control?.isConnected &&
          !control.closest('[inert]') &&
          control.checkVisibility?.({ visibilityProperty: true }) !== false
      );
      if (target?.matches(SIDEBAR_REVEAL_TRIGGER_SELECTOR)) {
        focusSidebarRevealTrigger(target);
      } else {
        target?.focus({ preventScroll: true });
      }
    });
  }, []);

  return { rememberFocus, restoreFocus };
}
