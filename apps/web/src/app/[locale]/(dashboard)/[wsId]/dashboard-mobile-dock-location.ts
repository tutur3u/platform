export type DockDestination = 'home' | 'tasks' | 'calendar';

const SECTION_DESTINATIONS: Record<string, DockDestination> = {
  tasks: 'tasks',
  calendar: 'calendar',
};

/** Mira on the web is the personal workspace home. */
export const MIRA_WORKSPACE = 'personal';

export interface DockLocation {
  /** The workspace path, with any locale prefix the current URL carries. */
  base: string;
  destination: DockDestination;
  /** True on a destination's own page, where the dock shows no Back. */
  atRoot: boolean;
  rootHref: string;
  /** Mira's page, with the same locale prefix as `base`. */
  miraHref: string;
}

/**
 * Where a dashboard path sits in the mobile dock. Home owns every workspace
 * section that is not its own destination, so its root is the workspace page
 * alone. Returns null when the path is outside this workspace.
 */
export function resolveDockLocation(
  pathname: string,
  wsId: string
): DockLocation | null {
  const segments = pathname.split('/').filter(Boolean);
  const index = segments.indexOf(wsId);
  if (index === -1) return null;

  const base = `/${segments.slice(0, index + 1).join('/')}`;
  const miraHref = `/${[...segments.slice(0, index), MIRA_WORKSPACE].join('/')}`;
  const rest = segments.slice(index + 1);
  const section = rest[0];
  const destination =
    (section && SECTION_DESTINATIONS[section]) || ('home' as const);
  const rootHref = destination === 'home' ? base : `${base}/${section}`;
  const atRoot = destination === 'home' ? rest.length === 0 : rest.length === 1;

  return { base, destination, atRoot, rootHref, miraHref };
}
