/**
 * The roadmap's four tabs and how a URL fragment selects one. Framework-free,
 * so the server, the client and the tests share one rule (the CSS default in
 * styles/tabs.css applies the same rule before any script runs).
 */
export const TAB_IDS = [
  'overview',
  'progress',
  'activity',
  'infrastructure',
] as const;

export type TabId = (typeof TAB_IDS)[number];

export const DEFAULT_TAB: TabId = 'overview';

export function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value);
}

/** The element id a fragment names: "#track-cms" → "track-cms". */
export function fragmentId(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The tab a fragment selects, as a pure function of the URL: a tab id
 * selects itself; an id inside a panel selects that panel's tab (old links
 * such as #pulse or #track-cms keep landing on their section); anything
 * else (no fragment, an unknown or malformed one, an element outside the
 * panels) selects the default tab. The CSS default, the first render after
 * hydration and every later fragment change (links, back, forward) agree.
 *
 * `panelOf` returns the tab whose panel contains the element with that id,
 * or null when there is no such element or it is outside the panels.
 */
export function tabForFragment(
  hash: string,
  panelOf: (id: string) => string | null
): TabId {
  const id = fragmentId(hash);
  if (!id) return DEFAULT_TAB;
  if (isTabId(id)) return id;
  const owner = panelOf(id);
  return owner && isTabId(owner) ? owner : DEFAULT_TAB;
}

/** The tab a roving-focus key moves to (WAI-ARIA tabs: arrows wrap). */
export function tabForKey(key: string, current: TabId): TabId | null {
  const index = TAB_IDS.indexOf(current);
  const last = TAB_IDS.length - 1;
  switch (key) {
    case 'ArrowRight':
      return TAB_IDS[index === last ? 0 : index + 1] ?? null;
    case 'ArrowLeft':
      return TAB_IDS[index === 0 ? last : index - 1] ?? null;
    case 'Home':
      return TAB_IDS[0];
    case 'End':
      return TAB_IDS[last] ?? null;
    default:
      return null;
  }
}
