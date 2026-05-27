import type { NavLink } from '@tuturuuu/ui/custom/navigation';

export const SIDEBAR_NAVIGATION_LAYOUT_CONFIG_ID = 'SIDEBAR_NAVIGATION_LAYOUT';
export const SIDEBAR_RECENT_NAVIGATION_ENABLED_CONFIG_ID =
  'SIDEBAR_RECENT_NAVIGATION_ENABLED';
export const MORE_TOOLS_NAVIGATION_ID = 'more_tools';
export const ARCHIVED_NAVIGATION_ID = 'archived_navigation';
export const SETTINGS_NAVIGATION_ID = 'settings';

export type SidebarNavigationPlacement = 'root' | 'more';

export interface SidebarNavigationLayoutConfig {
  hidden: string[];
  more: string[];
  root: string[];
}

export interface SidebarNavigationPreferenceItem {
  defaultPlacement: SidebarNavigationPlacement;
  id: string;
  placement: SidebarNavigationPlacement;
  hidden: boolean;
  locked: boolean;
  title: string;
}

export interface SidebarNavigationPreferenceResult {
  archivedLinks: NavLink[];
  items: SidebarNavigationPreferenceItem[];
  links: (NavLink | null)[];
  normalizedConfig: SidebarNavigationLayoutConfig;
}

const EMPTY_CONFIG: SidebarNavigationLayoutConfig = {
  hidden: [],
  more: [],
  root: [],
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;

    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function normalizeSidebarNavigationLayoutConfig(
  raw: unknown
): SidebarNavigationLayoutConfig {
  if (!raw) return { ...EMPTY_CONFIG };

  const parsed = (() => {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    }

    return raw;
  })();

  if (!parsed || typeof parsed !== 'object') return { ...EMPTY_CONFIG };

  const value = parsed as {
    hidden?: unknown;
    more?: unknown;
    root?: unknown;
  };

  return {
    hidden: uniqueStrings(value.hidden),
    more: uniqueStrings(value.more),
    root: uniqueStrings(value.root),
  };
}

export function serializeSidebarNavigationLayoutConfig(
  config: SidebarNavigationLayoutConfig
) {
  return JSON.stringify(normalizeSidebarNavigationLayoutConfig(config));
}

function cleanSeparators(items: (NavLink | null)[]): (NavLink | null)[] {
  const result: (NavLink | null)[] = [];

  for (const item of items) {
    if (!item && (result.length === 0 || result.at(-1) === null)) {
      continue;
    }

    result.push(item);
  }

  while (result.at(-1) === null) {
    result.pop();
  }

  return result;
}

function normalizePath(value: string): string {
  const path = (() => {
    if (/^https?:\/\//iu.test(value)) {
      try {
        return new URL(value).pathname;
      } catch {
        return value;
      }
    }

    return value;
  })();

  const [withoutQuery] = path.split('?');
  if (!withoutQuery) return '/';

  const withoutTrailingSlash = withoutQuery.replace(/\/+$/u, '');
  return withoutTrailingSlash || '/';
}

function matchesTarget(pathname: string, target?: string, matchExact = false) {
  if (!target) return false;

  const currentPath = normalizePath(pathname);
  const targetPath = normalizePath(target);

  if (matchExact) {
    return currentPath === targetPath;
  }

  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function matchesLinkPath(link: NavLink, pathname?: string): boolean {
  if (!pathname) return false;

  if (
    [link.href, ...(link.aliases ?? [])].some((target) =>
      matchesTarget(pathname, target, link.matchExact)
    )
  ) {
    return true;
  }

  return (
    link.children?.some((child) => child && matchesLinkPath(child, pathname)) ??
    false
  );
}

interface CollectedNavigationItem {
  defaultPlacement: SidebarNavigationPlacement;
  link: NavLink;
}

function collectPreferenceItems(links: (NavLink | null)[]) {
  const items: CollectedNavigationItem[] = [];
  let moreToolsTemplate: NavLink | null = null;

  for (const link of links) {
    if (!link) continue;

    if (link.id === MORE_TOOLS_NAVIGATION_ID) {
      moreToolsTemplate = link;

      for (const child of link.children ?? []) {
        if (!child?.id) continue;

        items.push({
          defaultPlacement:
            child.preferencePlacement === 'root' ? 'root' : 'more',
          link: child,
        });
      }

      continue;
    }

    if (!link.id) continue;

    items.push({
      defaultPlacement: link.preferencePlacement === 'root' ? 'root' : 'more',
      link,
    });
  }

  return {
    items,
    moreToolsTemplate,
  };
}

function filterKnownIds(ids: string[], knownIds: Set<string>) {
  return ids.filter((id) => knownIds.has(id));
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function insertRootNavigationId(rootIds: string[], id: string) {
  const withoutId = rootIds.filter((rootId) => rootId !== id);

  if (id === SETTINGS_NAVIGATION_ID) {
    return [...withoutId, id];
  }

  const settingsIndex = withoutId.indexOf(SETTINGS_NAVIGATION_ID);
  if (settingsIndex < 0) {
    return [...withoutId, id];
  }

  return [
    ...withoutId.slice(0, settingsIndex),
    id,
    ...withoutId.slice(settingsIndex),
  ];
}

function insertIdByPreferredOrder(
  ids: string[],
  id: string,
  preferredOrder: string[]
) {
  const withoutId = ids.filter((itemId) => itemId !== id);
  const preferredIndex = preferredOrder.indexOf(id);

  if (preferredIndex < 0) {
    return [...withoutId, id];
  }

  const insertBeforeIndex = withoutId.findIndex((itemId) => {
    const itemPreferredIndex = preferredOrder.indexOf(itemId);
    return itemPreferredIndex >= 0 && itemPreferredIndex > preferredIndex;
  });

  if (insertBeforeIndex < 0) {
    return [...withoutId, id];
  }

  return [
    ...withoutId.slice(0, insertBeforeIndex),
    id,
    ...withoutId.slice(insertBeforeIndex),
  ];
}

function buildPlacementOrder(args: {
  defaultPlacement: SidebarNavigationPlacement;
  explicitIds: string[];
  explicitPlacementIds: Set<string>;
  hiddenIds: Set<string>;
  itemById: Map<string, CollectedNavigationItem>;
  pathname?: string;
}) {
  const orderedIds = new Set<string>();
  const result: NavLink[] = [];

  const pushItem = (id: string) => {
    if (orderedIds.has(id)) return;

    const item = args.itemById.get(id);
    if (!item) return;

    const isActiveHidden =
      args.hiddenIds.has(id) && matchesLinkPath(item.link, args.pathname);
    if (args.hiddenIds.has(id) && !isActiveHidden) return;

    orderedIds.add(id);
    result.push(
      isActiveHidden
        ? {
            ...item.link,
            preferenceHiddenActive: true,
          }
        : item.link
    );
  };

  for (const id of args.explicitIds) {
    pushItem(id);
  }

  for (const [id, item] of args.itemById) {
    if (
      item.defaultPlacement !== args.defaultPlacement ||
      args.explicitPlacementIds.has(id)
    ) {
      continue;
    }

    pushItem(id);
  }

  return result;
}

function applyMoreToolSectionLabels(items: NavLink[]): NavLink[] {
  return items.map((item) => ({
    ...item,
    sectionLabel: item.preferenceSectionLabel,
  }));
}

export function applySidebarNavigationPreferences(
  links: (NavLink | null)[],
  rawConfig: unknown,
  options?: {
    pathname?: string;
  }
): SidebarNavigationPreferenceResult {
  const normalizedConfig = normalizeSidebarNavigationLayoutConfig(rawConfig);
  const { items, moreToolsTemplate } = collectPreferenceItems(links);
  const itemById = new Map(items.map((item) => [item.link.id!, item]));
  const knownIds = new Set(itemById.keys());
  const lockedIds = items
    .filter((item) => item.link.preferenceLocked)
    .map((item) => item.link.id!);
  const lockedIdSet = new Set(lockedIds);
  const lockedRootIds = items
    .filter(
      (item) =>
        item.link.preferenceLocked && item.link.id !== SETTINGS_NAVIGATION_ID
    )
    .map((item) => item.link.id!);
  const rootConfigIds = filterKnownIds(normalizedConfig.root, knownIds).filter(
    (id) => !lockedIdSet.has(id)
  );
  const moreConfigIds = filterKnownIds(normalizedConfig.more, knownIds).filter(
    (id) => !lockedIdSet.has(id)
  );
  const hiddenConfigIds = filterKnownIds(
    normalizedConfig.hidden,
    knownIds
  ).filter((id) => !lockedIdSet.has(id));
  const explicitPlacementIds = new Set([
    ...lockedRootIds,
    ...rootConfigIds,
    ...moreConfigIds,
  ]);
  const hiddenIds = new Set(hiddenConfigIds);
  const lockedRootItems = lockedRootIds
    .map((id) => itemById.get(id)?.link)
    .filter((link): link is NavLink => Boolean(link));
  const archivedLinks = hiddenConfigIds
    .map((id) => itemById.get(id)?.link)
    .filter((link): link is NavLink => Boolean(link));

  const rootItems = buildPlacementOrder({
    defaultPlacement: 'root',
    explicitIds: rootConfigIds,
    explicitPlacementIds,
    hiddenIds,
    itemById,
    pathname: options?.pathname,
  });
  const rootItemsWithoutSettings = rootItems.filter(
    (item) => item.id !== SETTINGS_NAVIGATION_ID
  );
  const settingsLink =
    itemById.get(SETTINGS_NAVIGATION_ID)?.link ??
    rootItems.find((item) => item.id === SETTINGS_NAVIGATION_ID) ??
    null;
  const moreItems = buildPlacementOrder({
    defaultPlacement: 'more',
    explicitIds: moreConfigIds,
    explicitPlacementIds,
    hiddenIds,
    itemById,
    pathname: options?.pathname,
  });
  const sectionedMoreItems = applyMoreToolSectionLabels(moreItems);

  const rootWithSeparators = cleanSeparators(
    [
      ...lockedRootItems,
      lockedRootItems.length > 0 && rootItemsWithoutSettings.length > 0
        ? null
        : undefined,
      ...rootItemsWithoutSettings,
    ].filter((link): link is NavLink | null => link !== undefined)
  );
  const linksWithMoreTools: (NavLink | null)[] =
    (sectionedMoreItems.length > 0 || archivedLinks.length > 0) &&
    moreToolsTemplate
      ? [
          ...rootWithSeparators,
          rootWithSeparators.length > 0 ? null : undefined,
          {
            ...moreToolsTemplate,
            children: cleanSeparators(sectionedMoreItems),
            disabled: false,
          },
        ].filter((link): link is NavLink | null => link !== undefined)
      : rootWithSeparators;
  const linksWithSettingsFooter: (NavLink | null)[] = settingsLink
    ? [
        ...linksWithMoreTools,
        linksWithMoreTools.length > 0 ? null : undefined,
        settingsLink,
      ].filter((link): link is NavLink | null => link !== undefined)
    : linksWithMoreTools;

  const placementById = new Map<string, SidebarNavigationPlacement>();
  for (const id of rootConfigIds) placementById.set(id, 'root');
  for (const id of moreConfigIds) placementById.set(id, 'more');

  const preferenceItems = items.map(({ defaultPlacement, link }) => {
    const id = link.id!;

    return {
      defaultPlacement,
      hidden: hiddenIds.has(id),
      id,
      locked: Boolean(link.preferenceLocked),
      placement: link.preferenceLocked
        ? 'root'
        : (placementById.get(id) ?? defaultPlacement),
      title: link.title,
    };
  });

  return {
    archivedLinks,
    items: preferenceItems,
    links: cleanSeparators(linksWithSettingsFooter),
    normalizedConfig: {
      hidden: hiddenConfigIds,
      more: moreConfigIds,
      root: rootConfigIds,
    },
  };
}

export function createSidebarNavigationLayoutConfigForHiddenState(
  links: (NavLink | null)[],
  rawConfig: unknown,
  id: string,
  hidden: boolean
): SidebarNavigationLayoutConfig {
  const normalizedConfig = normalizeSidebarNavigationLayoutConfig(rawConfig);
  const { items } = collectPreferenceItems(links);
  const itemById = new Map(items.map((item) => [item.link.id!, item]));
  const knownIds = new Set(itemById.keys());
  const targetItem = itemById.get(id);
  const lockedIds = new Set(
    items
      .filter((item) => item.link.preferenceLocked)
      .map((item) => item.link.id!)
  );

  if (!targetItem || targetItem.link.preferenceLocked) {
    return {
      hidden: filterKnownIds(normalizedConfig.hidden, knownIds).filter(
        (hiddenId) => !lockedIds.has(hiddenId)
      ),
      more: filterKnownIds(normalizedConfig.more, knownIds).filter(
        (moreId) => !lockedIds.has(moreId)
      ),
      root: filterKnownIds(normalizedConfig.root, knownIds).filter(
        (rootId) => !lockedIds.has(rootId)
      ),
    };
  }

  const applied = applySidebarNavigationPreferences(links, rawConfig);
  const rootIds = extractRootPreferenceIds(applied.links, lockedIds);
  const moreIds = extractMorePreferenceIds(applied.links);
  const hiddenIds = filterKnownIds(normalizedConfig.hidden, knownIds).filter(
    (hiddenId) => hiddenId !== id && !lockedIds.has(hiddenId)
  );

  for (const hiddenId of hiddenIds) {
    if (rootIds.includes(hiddenId) || moreIds.includes(hiddenId)) continue;

    const hiddenItem = itemById.get(hiddenId);
    if (!hiddenItem) continue;

    const hiddenPlacement = normalizedConfig.root.includes(hiddenId)
      ? 'root'
      : normalizedConfig.more.includes(hiddenId)
        ? 'more'
        : hiddenItem.defaultPlacement;

    if (hiddenPlacement === 'root') {
      rootIds.splice(
        0,
        rootIds.length,
        ...insertIdByPreferredOrder(rootIds, hiddenId, normalizedConfig.root)
      );
    } else {
      moreIds.splice(
        0,
        moreIds.length,
        ...insertIdByPreferredOrder(moreIds, hiddenId, normalizedConfig.more)
      );
    }
  }

  if (!rootIds.includes(id) && !moreIds.includes(id)) {
    const targetPlacement = normalizedConfig.root.includes(id)
      ? 'root'
      : normalizedConfig.more.includes(id)
        ? 'more'
        : targetItem.defaultPlacement;

    if (targetPlacement === 'root') {
      rootIds.splice(
        0,
        rootIds.length,
        ...insertIdByPreferredOrder(rootIds, id, normalizedConfig.root)
      );
    } else {
      moreIds.splice(
        0,
        moreIds.length,
        ...insertIdByPreferredOrder(moreIds, id, normalizedConfig.more)
      );
    }
  }

  return {
    hidden: hidden ? uniqueIds([...hiddenIds, id]) : hiddenIds,
    more: uniqueIds(moreIds),
    root: uniqueIds(rootIds),
  };
}

function extractRootPreferenceIds(
  links: (NavLink | null)[],
  lockedIds: Set<string>
) {
  return links
    .filter((link): link is NavLink => Boolean(link))
    .filter(
      (link) =>
        link.id &&
        link.id !== MORE_TOOLS_NAVIGATION_ID &&
        !lockedIds.has(link.id)
    )
    .map((link) => link.id!);
}

function extractMorePreferenceIds(links: (NavLink | null)[]) {
  const moreTools = links.find((link) => link?.id === MORE_TOOLS_NAVIGATION_ID);

  return (
    moreTools?.children
      ?.filter((link): link is NavLink => Boolean(link))
      .map((link) => link.id)
      .filter((id): id is string => Boolean(id)) ?? []
  );
}

export function createSidebarNavigationLayoutConfigForPlacement(
  links: (NavLink | null)[],
  rawConfig: unknown,
  id: string,
  placement: SidebarNavigationPlacement
): SidebarNavigationLayoutConfig {
  const normalizedConfig = normalizeSidebarNavigationLayoutConfig(rawConfig);
  const { items } = collectPreferenceItems(links);
  const itemById = new Map(items.map((item) => [item.link.id!, item]));
  const targetItem = itemById.get(id);
  const lockedIds = new Set(
    items
      .filter((item) => item.link.preferenceLocked)
      .map((item) => item.link.id!)
  );

  if (!targetItem || targetItem.link.preferenceLocked) {
    return {
      hidden: filterKnownIds(
        normalizedConfig.hidden,
        new Set(itemById.keys())
      ).filter((hiddenId) => !lockedIds.has(hiddenId)),
      more: filterKnownIds(
        normalizedConfig.more,
        new Set(itemById.keys())
      ).filter((moreId) => !lockedIds.has(moreId)),
      root: filterKnownIds(
        normalizedConfig.root,
        new Set(itemById.keys())
      ).filter((rootId) => !lockedIds.has(rootId)),
    };
  }

  const applied = applySidebarNavigationPreferences(links, rawConfig);
  const rootIds = extractRootPreferenceIds(applied.links, lockedIds);
  const moreIds = extractMorePreferenceIds(applied.links);
  const hiddenIds = filterKnownIds(
    normalizedConfig.hidden,
    new Set(itemById.keys())
  ).filter((hiddenId) => hiddenId !== id && !lockedIds.has(hiddenId));

  for (const hiddenId of hiddenIds) {
    if (rootIds.includes(hiddenId) || moreIds.includes(hiddenId)) continue;

    const hiddenItem = itemById.get(hiddenId);
    if (!hiddenItem) continue;

    const hiddenPlacement = normalizedConfig.root.includes(hiddenId)
      ? 'root'
      : normalizedConfig.more.includes(hiddenId)
        ? 'more'
        : hiddenItem.defaultPlacement;

    if (hiddenPlacement === 'root') {
      rootIds.push(hiddenId);
    } else {
      moreIds.push(hiddenId);
    }
  }

  const rootWithoutTarget = rootIds.filter((rootId) => rootId !== id);
  const moreWithoutTarget = moreIds.filter((moreId) => moreId !== id);

  return {
    hidden: hiddenIds,
    more:
      placement === 'more'
        ? uniqueIds([...moreWithoutTarget, id])
        : uniqueIds(moreWithoutTarget),
    root:
      placement === 'root'
        ? uniqueIds(insertRootNavigationId(rootWithoutTarget, id))
        : uniqueIds(rootWithoutTarget),
  };
}

export function promoteArchivedWhenMoreToolsOnlyHasArchive(
  links: (NavLink | null)[]
): (NavLink | null)[] {
  return links.flatMap((link) => {
    if (!link || link.id !== MORE_TOOLS_NAVIGATION_ID) {
      return [link];
    }

    const nonNullChildren = (link.children ?? []).filter(
      (child): child is NavLink => Boolean(child)
    );

    if (
      nonNullChildren.length === 1 &&
      nonNullChildren[0]?.id === ARCHIVED_NAVIGATION_ID
    ) {
      return [nonNullChildren[0]];
    }

    return [link];
  });
}
