'use client';

import { createContext, useContext, useLayoutEffect, useState } from 'react';

/**
 * How long a closed overlay keeps the sidebar pinned. A menu item that opens
 * another overlay (user menu, then Notifications, a dialog or a submenu) closes
 * one before the next mounts; without the grace the sidebar would collapse in
 * that gap and take the new overlay's anchor with it.
 */
export const SIDEBAR_OVERLAY_HANDOFF_MS = 400;

export const SidebarOverlayContext = createContext<(() => () => void) | null>(
  null
);

export function useSidebarOverlayOpenChange({
  open,
  defaultOpen = false,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const registerOverlay = useContext(SidebarOverlayContext);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;

  useLayoutEffect(() => {
    if (!isOpen) return;
    const release = registerOverlay?.();
    if (!release) return;
    return () => {
      setTimeout(release, SIDEBAR_OVERLAY_HANDOFF_MS);
    };
  }, [isOpen, registerOverlay]);

  if (!registerOverlay) return onOpenChange;

  return (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
}
