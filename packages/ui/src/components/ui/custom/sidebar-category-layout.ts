import type { NavLink } from './navigation';
import {
  getSidebarCategory,
  getSidebarCategoryDefinition,
  getSidebarCategoryRank,
  getSidebarItemRank,
  type SidebarCategoryId,
} from './sidebar-categories';

export type { SidebarCategoryId } from './sidebar-categories';

export const SIDEBAR_SETTINGS_NAVIGATION_ID = 'settings';

/** Translated category headers, keyed by category id. */
export type SidebarCategoryLabels = Partial<Record<SidebarCategoryId, string>>;

function cleanNavSeparators(items: (NavLink | null)[]): (NavLink | null)[] {
  const result: (NavLink | null)[] = [];

  for (const item of items) {
    if (!item && (result.length === 0 || result.at(-1) === null)) continue;
    result.push(item);
  }

  while (result.at(-1) === null) result.pop();

  return result;
}

/**
 * Lays visible items out as one flat list grouped by category. Within a
 * category, items the user explicitly ordered come first (in their order),
 * followed by the remaining items in registry order.
 */
export function groupNavLinksByCategory(
  items: NavLink[],
  explicitOrder: string[],
  categoryLabels: SidebarCategoryLabels | undefined
): NavLink[] {
  const explicitIndex = new Map(explicitOrder.map((id, index) => [id, index]));
  const byCategory = new Map<SidebarCategoryId, NavLink[]>();

  for (const item of items) {
    const category = getSidebarCategory(item.id);
    byCategory.set(category, [...(byCategory.get(category) ?? []), item]);
  }

  const orderedCategories = [...byCategory.keys()].sort(
    (left, right) =>
      getSidebarCategoryRank(left) - getSidebarCategoryRank(right)
  );

  return orderedCategories.flatMap((categoryId) => {
    const definition = getSidebarCategoryDefinition(categoryId);
    const label = definition.showLabel
      ? (categoryLabels?.[categoryId] ?? categoryId)
      : undefined;

    return (byCategory.get(categoryId) ?? [])
      .map((item, position) => ({ item, position }))
      .sort((left, right) => {
        const leftExplicit = explicitIndex.get(left.item.id!);
        const rightExplicit = explicitIndex.get(right.item.id!);

        if (leftExplicit !== undefined && rightExplicit !== undefined) {
          return leftExplicit - rightExplicit;
        }
        if (leftExplicit !== undefined) return -1;
        if (rightExplicit !== undefined) return 1;

        return (
          getSidebarItemRank(left.item.id) -
            getSidebarItemRank(right.item.id) || left.position - right.position
        );
      })
      .map(({ item }) => ({
        ...item,
        sectionCollapsible: definition.collapsible,
        sectionId: categoryId,
        sectionLabel: label,
      }));
  });
}

/**
 * Archived items live in a single "Archived" entry just above the Settings
 * footer, so the sidebar stays one flat list.
 */
export function appendArchivedNavigationLink(
  links: (NavLink | null)[],
  archivedLink: NavLink
): (NavLink | null)[] {
  const settingsIndex = links.findIndex(
    (link) => link?.id === SIDEBAR_SETTINGS_NAVIGATION_ID
  );

  if (settingsIndex < 0) {
    return cleanNavSeparators([...links, null, archivedLink]);
  }

  return cleanNavSeparators([
    ...links.slice(0, settingsIndex),
    archivedLink,
    ...links.slice(settingsIndex),
  ]);
}
