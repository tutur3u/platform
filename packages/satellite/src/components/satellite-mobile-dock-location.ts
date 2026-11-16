export type SatelliteDockSlot = 'home' | 'tasks' | 'calendar' | 'mira' | 'apps';

/** Apps whose own page owns a dock destination; every other app keeps Apps. */
const APP_SLOTS: Partial<Record<string, SatelliteDockSlot>> = {
  tasks: 'tasks',
  calendar: 'calendar',
};

/** Sections that are part of an app's own root (Tasks lives at /<ws>/tasks). */
const ROOT_SECTIONS: Partial<Record<string, string>> = {
  tasks: 'tasks',
};

export interface SatelliteDockLocation {
  active: SatelliteDockSlot;
  /** The workspace path inside the app, with any locale prefix the URL has. */
  base: string;
  /** The app's workspace root, inside the app (no base path, keeps a locale). */
  rootPath: string;
  /** False below the app's root, where the dock shows Back. */
  atRoot: boolean;
  workspace: string;
}

/**
 * Where a satellite page sits in the product-wide mobile dock. Returns null
 * outside a workspace route.
 */
export function resolveSatelliteDockLocation(
  pathname: string,
  workspace: string | undefined,
  currentApp: string
): SatelliteDockLocation | null {
  if (!workspace) return null;
  const segments = pathname.split('/').filter(Boolean);
  const index = segments.indexOf(workspace);
  if (index === -1) return null;

  const rootSection = ROOT_SECTIONS[currentApp];
  const base = `/${segments.slice(0, index + 1).join('/')}`;
  const rest = segments.slice(index + 1);
  const rootPath = rootSection ? `${base}/${rootSection}` : base;
  const atRoot =
    rest.length === 0 || (rest.length === 1 && rest[0] === rootSection);

  return {
    active: APP_SLOTS[currentApp] ?? 'apps',
    base,
    rootPath,
    atRoot,
    workspace,
  };
}
