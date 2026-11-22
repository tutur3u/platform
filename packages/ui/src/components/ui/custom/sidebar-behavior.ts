/**
 * Sidebar behavior modes, shared by every shell.
 *
 * - `expanded`: the full sidebar, in flow.
 * - `collapsed`: an icon rail, in flow.
 * - `hover`: the rail at rest; hovering it opens the full sidebar as an overlay.
 * - `minimal`: only the Tuturuuu logo at rest; hovering, focusing or tapping it
 *   opens the full sidebar as an overlay.
 *
 * `hidden` is a retired alias: a stored value (cookie, account config,
 * assistant tool call) reads as `minimal`, so no reader strands a user on a
 * sidebar with no visible way back.
 */
export const SIDEBAR_BEHAVIORS = [
  'expanded',
  'collapsed',
  'hover',
  'minimal',
] as const;

export type SidebarBehavior = (typeof SIDEBAR_BEHAVIORS)[number];

/** The retired alias of `minimal`; accepted on read, never written. */
export const LEGACY_HIDDEN_SIDEBAR_BEHAVIOR = 'hidden';

/** A valid behavior, with the legacy `hidden` read as `minimal`; else null. */
export function normalizeSidebarBehavior(
  value: unknown
): SidebarBehavior | null {
  if (value === LEGACY_HIDDEN_SIDEBAR_BEHAVIOR) return 'minimal';
  return (SIDEBAR_BEHAVIORS as readonly unknown[]).includes(value)
    ? (value as SidebarBehavior)
    : null;
}

/** Modes whose sidebar is collapsed at rest. */
export function restsCollapsed(behavior: SidebarBehavior | undefined) {
  return (
    behavior === 'collapsed' || behavior === 'hover' || behavior === 'minimal'
  );
}

/** Modes that open the full sidebar as an overlay over the page. */
export function opensAsOverlay(behavior: SidebarBehavior | undefined) {
  return behavior === 'hover' || behavior === 'minimal';
}
