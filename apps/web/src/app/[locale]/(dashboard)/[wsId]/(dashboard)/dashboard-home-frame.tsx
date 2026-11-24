import type { ReactNode } from 'react';

/**
 * Frames the workspace home as one viewport-tall column: banners and nudges
 * keep their natural height (`shrink-0`) and the Mira card takes whatever is
 * left (`flex-1`, never below 20rem), so the prompt bar stays on screen
 * whether or not a banner is shown or dismissed. When the banners plus the
 * minimum card height exceed the viewport, the page scrolls instead.
 *
 * The height subtracts the shell's own padding: the mobile top bar, dock
 * clearance and gutter on small screens, and the 1rem page padding on both
 * sides from `md`.
 */
export const DASHBOARD_HOME_FRAME_CLASS =
  'flex h-[calc(100dvh-var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-top,0px)))-1.25rem-var(--mobile-dock-clearance,0px))] min-h-0 flex-col gap-4 md:h-[calc(100dvh-2rem)]';

export function DashboardHomeFrame({ children }: { children: ReactNode }) {
  return (
    <div className={DASHBOARD_HOME_FRAME_CLASS} data-slot="dashboard-home">
      {children}
    </div>
  );
}
