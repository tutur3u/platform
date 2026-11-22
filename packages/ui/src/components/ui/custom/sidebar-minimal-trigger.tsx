'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/**
 * Minimal mode's only resting chrome: the logo, which opens the sidebar on
 * hover, keyboard focus or tap. `useSidebarOverlayClose` finds it by its
 * `data-sidebar-reveal-trigger` attribute and wires those interactions.
 *
 * It stays mounted under the open panel, so keyboard focus that revealed the
 * sidebar is never moved; the panel draws the ring for it meanwhile.
 */
export function SidebarMinimalTrigger({
  controls,
  expanded,
  label,
  logo,
}: {
  controls: string;
  expanded: boolean;
  label?: string;
  logo: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-controls={controls}
      aria-expanded={expanded}
      aria-label={label}
      data-sidebar-reveal-trigger=""
      className={cn(
        'absolute top-3.5 left-[calc((var(--sidebar-collapsed-width)-2.5rem)/2)] hidden size-10 cursor-pointer items-center justify-center rounded-xl outline-none transition-[background-color,opacity] duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:flex',
        expanded && 'pointer-events-none opacity-0'
      )}
    >
      {logo}
    </button>
  );
}
