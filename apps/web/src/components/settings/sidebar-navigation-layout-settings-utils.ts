import { arrayMove } from '@dnd-kit/sortable';
import {
  getSidebarCategory,
  getSidebarCategoryRank,
} from '@tuturuuu/ui/custom/sidebar-categories';
import {
  normalizeSidebarNavigationLayoutConfig,
  SETTINGS_NAVIGATION_ID,
  type SidebarNavigationLayoutConfig,
  type SidebarNavigationPlacement,
} from '../../app/[locale]/(dashboard)/[wsId]/sidebar-navigation-preferences';
import type { NavigationItemDefinition } from './sidebar-navigation-layout-settings.types';

export function hydrateConfig(
  items: NavigationItemDefinition[],
  raw: unknown
): SidebarNavigationLayoutConfig {
  const normalized = normalizeSidebarNavigationLayoutConfig(raw);
  const itemIds = new Set(items.map((item) => item.id));
  const lockedIds = items.filter((item) => item.locked).map((item) => item.id);
  const lockedIdSet = new Set(lockedIds);
  const lockedLeadingRootIds = items
    .filter((item) => item.locked && item.id !== SETTINGS_NAVIGATION_ID)
    .map((item) => item.id);
  const root = [
    ...lockedLeadingRootIds,
    ...normalized.root.filter((id) => itemIds.has(id) && !lockedIdSet.has(id)),
  ];
  const more = normalized.more.filter(
    (id) => itemIds.has(id) && !lockedIdSet.has(id)
  );
  const explicitIds = new Set([...root, ...more]);

  for (const item of items) {
    if (
      (item.locked && item.id !== SETTINGS_NAVIGATION_ID) ||
      explicitIds.has(item.id)
    ) {
      continue;
    }

    if (item.defaultPlacement === 'root') {
      root.push(item.id);
    } else {
      more.push(item.id);
    }
  }

  return {
    hidden: normalized.hidden.filter(
      (id) => itemIds.has(id) && !lockedIdSet.has(id)
    ),
    more,
    root,
  };
}

export function getConfigItems(
  config: SidebarNavigationLayoutConfig,
  items: NavigationItemDefinition[],
  placement: SidebarNavigationPlacement
) {
  const hiddenIds = new Set(config.hidden);
  const definitionById = new Map(items.map((item) => [item.id, item]));

  // Grouped by the sidebar's category order so each category header appears
  // once. The relative order inside a category is the saved order, which is
  // exactly what the sidebar uses within that category.
  return config[placement]
    .map((id, position) => ({ item: definitionById.get(id), position }))
    .filter(
      (entry): entry is { item: NavigationItemDefinition; position: number } =>
        Boolean(entry.item)
    )
    .filter(({ item }) => !hiddenIds.has(item.id))
    .sort(
      (left, right) =>
        getSidebarCategoryRank(getSidebarCategory(left.item.id)) -
          getSidebarCategoryRank(getSidebarCategory(right.item.id)) ||
        left.position - right.position
    )
    .map(({ item }) => item);
}

export function getHiddenItems(
  config: SidebarNavigationLayoutConfig,
  items: NavigationItemDefinition[]
) {
  const hiddenIds = new Set(config.hidden);
  return items.filter((item) => hiddenIds.has(item.id));
}

export function moveId(ids: string[], id: string, direction: -1 | 1) {
  const visibleIndex = ids.indexOf(id);
  const nextIndex = visibleIndex + direction;

  if (visibleIndex < 0 || nextIndex < 0 || nextIndex >= ids.length) {
    return ids;
  }

  return arrayMove(ids, visibleIndex, nextIndex);
}

export function keepLockedItemsFirst(
  ids: string[],
  definitionById: Map<string, NavigationItemDefinition>
) {
  const leadingLocked = ids.filter(
    (id) => definitionById.get(id)?.locked && id !== SETTINGS_NAVIGATION_ID
  );
  const settings = ids.filter((id) => id === SETTINGS_NAVIGATION_ID);
  const movable = ids.filter(
    (id) => !definitionById.get(id)?.locked && id !== SETTINGS_NAVIGATION_ID
  );
  return [...leadingLocked, ...movable, ...settings];
}
