'use client';

import { createContext, useContext, useLayoutEffect, useState } from 'react';

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
    if (isOpen) return registerOverlay?.();
  }, [isOpen, registerOverlay]);

  if (!registerOverlay) return onOpenChange;

  return (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
}
