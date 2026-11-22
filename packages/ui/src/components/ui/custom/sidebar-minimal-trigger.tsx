'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/**
 * Minimal mode's only resting chrome: the logo, which opens the sidebar on
 * hover, keyboard focus or tap. `useSidebarOverlayClose` finds it by its
 * `data-sidebar-reveal-trigger` attribute and wires those interactions.
 *
 * It floats at a fixed inset and keeps the same place, size and look whether
 * the panel is open or not: the open panel's header reserves its square, so a
 * click after hover still interacts with the sidebar and nothing moves. The
 * panel draws the focus ring while open. A rounded square (the theme's row
 * radius, which the Sorbet Corners option scales) frames the logo.
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
        'absolute top-[var(--sidebar-minimal-inset)] left-[var(--sidebar-minimal-inset)] z-10 hidden size-[var(--sidebar-minimal-trigger)] cursor-pointer items-center justify-center rounded-[var(--radius)] border border-border bg-card shadow-elevation-1 outline-none transition-colors duration-150 hover:bg-accent motion-reduce:transition-none md:flex',
        !expanded && 'focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {logo}
    </button>
  );
}
