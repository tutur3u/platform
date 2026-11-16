import type { ReactNode } from 'react';

interface WorkspaceDashboardLayoutProps {
  /** Accessible name of the overview region. */
  label: string;
  /** Accessible name of the side rail. */
  railLabel: string;
  /** Mira: first in the main column, docked to the bottom when narrow. */
  dock: ReactNode;
  main: ReactNode;
  rail?: ReactNode;
}

/**
 * Workspace overview grid. Columns follow the width the dashboard actually
 * gets (a size container), not the viewport, so a collapsed or expanded
 * sidebar never squeezes the cards:
 * - 56rem (896px) and wider: Mira and the cards in the main column, the rail
 *   beside them (20rem);
 * - 40rem to 56rem: one column (Mira, cards, then the rail, whose cards sit in
 *   one or two columns of at least 17.5rem);
 * - below 40rem (phones): Mira moves to the end and docks to the bottom of
 *   the viewport, above the Sorbet mobile dock when it is shown. Being last
 *   in the flow, it never covers the final card once scrolled to the end, and
 *   focused controls keep a scroll margin so the dock never hides them.
 * Breakpoints are documented in apps/docs/platform/features/workspace-dashboard.mdx
 * and enforced by apps/web/e2e/dashboard-layout.spec.ts.
 */
export function WorkspaceDashboardLayout({
  label,
  railLabel,
  dock,
  main,
  rail,
}: WorkspaceDashboardLayoutProps) {
  const dockClearance =
    '@max-[40rem]/dashboard:[&_a]:scroll-mb-[calc(min(18rem,45dvh)+6rem)] @max-[40rem]/dashboard:[&_button]:scroll-mb-[calc(min(18rem,45dvh)+6rem)]';

  return (
    <div
      aria-label={label}
      role="region"
      data-dashboard-layout
      className="@container/dashboard w-full min-w-0"
    >
      <div className="mx-auto grid w-full min-w-0 max-w-7xl grid-cols-1 items-start gap-4 @min-[56rem]/dashboard:grid-cols-[minmax(0,1fr)_20rem] @min-[56rem]/dashboard:grid-rows-[auto_1fr]">
        <div
          data-dashboard-region="dock"
          className="min-w-0 @max-[40rem]/dashboard:sticky @max-[40rem]/dashboard:order-last @max-[40rem]/dashboard:bottom-2 @max-[40rem]/dashboard:rounded-xl @max-[40rem]/dashboard:bg-background @max-[40rem]/dashboard:shadow-lg max-md:[:root[data-ui=sorbet]:has([data-slot=mobile-dock])_&]:bottom-[calc(var(--sorbet-content-bottom-clearance)+0.5rem)] @min-[56rem]/dashboard:col-start-1 @min-[56rem]/dashboard:row-start-1"
        >
          {dock}
        </div>
        <div
          data-dashboard-region="main"
          className={`grid min-w-0 gap-4 @min-[56rem]/dashboard:col-start-1 @min-[56rem]/dashboard:row-start-2 ${dockClearance}`}
        >
          {main}
        </div>
        {rail ? (
          <aside
            aria-label={railLabel}
            data-dashboard-region="rail"
            className={`grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] items-start gap-4 @min-[56rem]/dashboard:col-start-2 @min-[56rem]/dashboard:row-span-2 @min-[56rem]/dashboard:row-start-1 ${dockClearance}`}
          >
            {rail}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
