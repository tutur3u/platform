'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/**
 * Minimal mode's only resting chrome: the logo, which opens the sidebar on
 * hover, keyboard focus or tap. `useSidebarOverlayClose` finds it by its
 * `data-sidebar-reveal-trigger` attribute and wires those interactions.
 *
 * The same button sits over the panel's brand slot while open, so a click
 * after hover still interacts with the sidebar. The panel draws its focus ring.
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
      aria-controls={expanded ? controls : undefined}
      aria-expanded={expanded}
      aria-label={label}
      data-sidebar-reveal-trigger=""
      className={cn(
        'absolute top-3 left-2 z-10 hidden size-10 cursor-pointer items-center justify-center rounded-xl border outline-none transition-colors duration-150 hover:bg-accent motion-reduce:transition-none md:flex',
        expanded
          ? 'translate-x-2 translate-y-1 border-transparent'
          : 'border-border bg-card focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {logo}
    </button>
  );
}
