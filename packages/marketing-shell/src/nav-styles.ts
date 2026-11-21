import { cn } from '@tuturuuu/utils/format';

/**
 * One control shape for everything in the navbar. Height and radius come from
 * the floating-bar tokens (`@tuturuuu/ui/floating-bar.css`) that
 * MarketingNavShell sets, so the full and compact bars resize every control
 * together and corners stay concentric with the bar.
 */
export const navControl =
  'inline-flex h-(--bar-control-height) shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-(--radius-bar-inner) font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring';

/** Quiet control: links, menu triggers and the preference and menu buttons. */
export const navGhost = cn(
  navControl,
  'px-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground'
);

/** Square (circular in the capsule) icon-only control. */
export const navIconButton = cn(navGhost, 'w-(--bar-control-height) px-0');

/** The one filled call to action. */
export const navPrimary = cn(
  navControl,
  'bg-primary px-3.5 text-primary-foreground hover:bg-primary/90'
);
