import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type {
  RecentSidebarIconKey,
  RecentSidebarVisitBadge,
  RecentSidebarVisitSnapshot,
} from '@tuturuuu/ui/tu-do/shared/recent-sidebar-events';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';

export interface RecentSidebarEntry {
  href: string;
  snapshot?: RecentSidebarVisitSnapshot;
  visitedAt: string;
}

export interface RecentSidebarLabels {
  archivedBadge: string;
  debtItem: string;
  invoiceItem: string;
  projectItem: string;
  taskBoardItem: string;
  taskItem: string;
  templateItem: string;
  transactionItem: string;
  walletItem: string;
  whiteboardItem: string;
}

export interface ResolvedRecentSidebarItem extends RecentSidebarEntry {
  badges: {
    label: string;
    tone: 'default' | 'feature' | 'warning';
  }[];
  iconKey: RecentSidebarIconKey;
  subtitle?: string;
  title: string;
}

interface FlattenedNavLink {
  aliases: string[];
  ancestors: string[];
  href?: string;
  title: string;
}

export const MAX_RECENT_SIDEBAR_ITEMS = 10;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePath(pathname: string): string {
  const [path] = pathname.split('?');
  if (!path) return '/';

  const trimmed = path.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : '/';
}

function isWorkspaceSegment(segment: string | undefined): boolean {
  if (!segment) return false;
  return (
    segment === 'internal' ||
    segment === 'personal' ||
    UUID_PATTERN.test(segment)
  );
}

function getWorkspaceSegmentIndex(segments: string[]): number | null {
  if (isWorkspaceSegment(segments[0])) return 0;
  if (isWorkspaceSegment(segments[1])) return 1;
  return null;
}

export function normalizeRecentSidebarHref(
  href: string,
  options?: {
    currentPathname?: string;
    wsId?: string;
  }
): string {
  const normalizedHref = normalizePath(href);
  const currentPathname = options?.currentPathname;
  const wsId = options?.wsId;

  if (!currentPathname || !wsId) {
    return normalizedHref;
  }

  const hrefSegments = normalizedHref.split('/').filter(Boolean);
  const currentSegments = normalizePath(currentPathname)
    .split('/')
    .filter(Boolean);
  const hrefWorkspaceIndex = getWorkspaceSegmentIndex(hrefSegments);
  const currentWorkspaceIndex = getWorkspaceSegmentIndex(currentSegments);

  if (
    hrefWorkspaceIndex === null ||
    currentWorkspaceIndex === null ||
    hrefWorkspaceIndex !== currentWorkspaceIndex
  ) {
    return normalizedHref;
  }

  const hrefWorkspaceSegment = hrefSegments[hrefWorkspaceIndex];
  const currentWorkspaceSegment = currentSegments[currentWorkspaceIndex];
  if (!hrefWorkspaceSegment || !currentWorkspaceSegment) {
    return normalizedHref;
  }

  const hrefWorkspaceId =
    hrefWorkspaceSegment === 'personal'
      ? wsId
      : resolveWorkspaceId(hrefWorkspaceSegment);

  if (
    hrefWorkspaceSegment === currentWorkspaceSegment ||
    hrefWorkspaceId === wsId ||
    (hrefWorkspaceSegment === ROOT_WORKSPACE_ID &&
      currentWorkspaceSegment === 'internal')
  ) {
    hrefSegments[hrefWorkspaceIndex] = currentWorkspaceSegment;
    return `/${hrefSegments.join('/')}`;
  }

  return normalizedHref;
}

function matchesTarget(pathname: string, target?: string): boolean {
  if (!target) return false;

  const normalizedPath = normalizePath(pathname);
  const normalizedTarget = normalizePath(target);

  return (
    normalizedPath === normalizedTarget ||
    normalizedPath.startsWith(`${normalizedTarget}/`)
  );
}

function flattenNavLinks(
  links: (NavLink | null)[],
  ancestors: string[] = []
): FlattenedNavLink[] {
  return links.flatMap((link) => {
    if (!link) return [];

    const entry: FlattenedNavLink = {
      title: link.title,
      href: link.href,
      aliases: link.aliases ?? [],
      ancestors,
    };

    if (!link.children?.length) {
      return [entry];
    }

    return [
      entry,
      ...flattenNavLinks(link.children, [...ancestors, link.title]),
    ];
  });
}

function findBestNavMatch(
  pathname: string,
  links: (NavLink | null)[]
): FlattenedNavLink | null {
  const normalizedPath = normalizePath(pathname);
  const flattenedLinks = flattenNavLinks(links);
  const getMatchLength = (target?: string) =>
    matchesTarget(normalizedPath, target)
      ? normalizePath(target ?? '').length
      : 0;

  return (
    flattenedLinks
      .filter((link) =>
        [link.href, ...link.aliases].some((target) =>
          matchesTarget(normalizedPath, target)
        )
      )
      .sort((a, b) => {
        const aLength = Math.max(
          0,
          ...[a.href, ...a.aliases].map(getMatchLength)
        );
        const bLength = Math.max(
          0,
          ...[b.href, ...b.aliases].map(getMatchLength)
        );

        return bLength - aLength;
      })[0] ?? null
  );
}

function formatDynamicSegment(segment: string): string {
  const decoded = decodeURIComponent(segment);

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      decoded
    )
  ) {
    return decoded.slice(-6);
  }

  if (decoded.length <= 24) {
    return decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return decoded.slice(0, 8);
}

function buildParentHref(segments: string[], endIndex: number): string {
  return `/${segments.slice(0, endIndex).join('/')}`;
}

function buildDynamicItem(
  href: string,
  title: string,
  iconKey: RecentSidebarIconKey,
  links: (NavLink | null)[],
  parentHref?: string
): ResolvedRecentSidebarItem {
  const parentMatch = parentHref ? findBestNavMatch(parentHref, links) : null;

  return {
    href,
    visitedAt: '',
    title,
    iconKey,
    badges: [],
    subtitle: parentMatch?.title ?? parentMatch?.ancestors.at(-1),
  };
}

function resolveSnapshotBadges(
  badges: RecentSidebarVisitBadge[] | undefined,
  labels: RecentSidebarLabels
): ResolvedRecentSidebarItem['badges'] {
  if (!badges?.length) return [];

  return badges
    .map((badge) => {
      switch (badge.kind) {
        case 'archived':
          return {
            label: labels.archivedBadge,
            tone: 'warning' as const,
          };
        case 'ticket-prefix':
          return {
            label: badge.value.toUpperCase(),
            tone: 'feature' as const,
          };
        case 'board':
        case 'list':
          return {
            label: badge.value,
            tone: 'default' as const,
          };
        default:
          return null;
      }
    })
    .filter((badge): badge is NonNullable<typeof badge> => Boolean(badge))
    .slice(0, 3);
}

function resolveDynamicItem(
  pathname: string,
  links: (NavLink | null)[],
  labels: RecentSidebarLabels
): ResolvedRecentSidebarItem | null {
  const normalizedPath = normalizePath(pathname);
  const segments = normalizedPath.split('/').filter(Boolean);

  const tasksIndex = segments.indexOf('tasks');
  const whiteboardsIndex = segments.indexOf('whiteboards');
  const financeIndex = segments.indexOf('finance');

  if (
    tasksIndex >= 0 &&
    segments[tasksIndex + 1] &&
    ![
      'boards',
      'projects',
      'templates',
      'drafts',
      'habits',
      'labels',
      'initiatives',
      'logs',
      'notes',
      'estimates',
      'cycles',
    ].includes(segments[tasksIndex + 1]!)
  ) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.taskItem} ${formatDynamicSegment(segments[tasksIndex + 1]!)}`,
      'task',
      links,
      buildParentHref(segments, tasksIndex + 1)
    );
  }

  if (
    tasksIndex >= 0 &&
    segments[tasksIndex + 1] === 'boards' &&
    segments[tasksIndex + 2]
  ) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.taskBoardItem} ${formatDynamicSegment(
        segments[tasksIndex + 2]!
      )}`,
      'task-board',
      links,
      buildParentHref(segments, tasksIndex + 2)
    );
  }

  if (
    tasksIndex >= 0 &&
    segments[tasksIndex + 1] === 'projects' &&
    segments[tasksIndex + 2]
  ) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.projectItem} ${formatDynamicSegment(
        segments[tasksIndex + 2]!
      )}`,
      'project',
      links,
      buildParentHref(segments, tasksIndex + 2)
    );
  }

  if (
    tasksIndex >= 0 &&
    segments[tasksIndex + 1] === 'templates' &&
    segments[tasksIndex + 2] &&
    segments[tasksIndex + 2] !== 'marketplace'
  ) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.templateItem} ${formatDynamicSegment(
        segments[tasksIndex + 2]!
      )}`,
      'template',
      links,
      buildParentHref(segments, tasksIndex + 2)
    );
  }

  if (whiteboardsIndex >= 0 && segments[whiteboardsIndex + 1]) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.whiteboardItem} ${formatDynamicSegment(
        segments[whiteboardsIndex + 1]!
      )}`,
      'whiteboard',
      links,
      buildParentHref(segments, whiteboardsIndex + 1)
    );
  }

  if (
    financeIndex >= 0 &&
    segments[financeIndex + 1] === 'wallets' &&
    segments[financeIndex + 2]
  ) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.walletItem} ${formatDynamicSegment(
        segments[financeIndex + 2]!
      )}`,
      'wallet',
      links,
      buildParentHref(segments, financeIndex + 2)
    );
  }

  if (
    financeIndex >= 0 &&
    segments[financeIndex + 1] === 'invoices' &&
    segments[financeIndex + 2] &&
    segments[financeIndex + 2] !== 'new'
  ) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.invoiceItem} ${formatDynamicSegment(
        segments[financeIndex + 2]!
      )}`,
      'invoice',
      links,
      buildParentHref(segments, financeIndex + 2)
    );
  }

  if (
    financeIndex >= 0 &&
    segments[financeIndex + 1] === 'transactions' &&
    segments[financeIndex + 2]
  ) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.transactionItem} ${formatDynamicSegment(
        segments[financeIndex + 2]!
      )}`,
      'transaction',
      links,
      buildParentHref(segments, financeIndex + 2)
    );
  }

  if (
    financeIndex >= 0 &&
    segments[financeIndex + 1] === 'debts' &&
    segments[financeIndex + 2]
  ) {
    return buildDynamicItem(
      normalizedPath,
      `${labels.debtItem} ${formatDynamicSegment(segments[financeIndex + 2]!)}`,
      'debt',
      links,
      buildParentHref(segments, financeIndex + 2)
    );
  }

  return null;
}

function getStaticIconKey(pathname: string): RecentSidebarIconKey {
  const normalizedPath = normalizePath(pathname);

  if (normalizedPath.includes('/whiteboards')) return 'whiteboard';
  if (normalizedPath.includes('/tasks/boards')) return 'task-board';
  if (normalizedPath.includes('/tasks')) return 'task';
  if (normalizedPath.includes('/finance/wallets')) return 'wallet';
  if (normalizedPath.includes('/finance/invoices')) return 'invoice';
  if (normalizedPath.includes('/finance/transactions')) return 'transaction';
  if (normalizedPath.includes('/finance/debts')) return 'debt';
  if (normalizedPath.includes('/tasks/projects')) return 'project';
  if (normalizedPath.includes('/tasks/templates')) return 'template';

  return 'default';
}

export function resolveRecentSidebarItem(
  pathname: string,
  links: (NavLink | null)[],
  labels: RecentSidebarLabels
): ResolvedRecentSidebarItem | null {
  const normalizedPath = normalizePath(pathname);

  if (normalizedPath === '/' || normalizedPath === '/home') {
    return null;
  }

  const dynamicItem = resolveDynamicItem(normalizedPath, links, labels);
  if (dynamicItem) return dynamicItem;

  const bestMatch = findBestNavMatch(normalizedPath, links);
  if (!bestMatch) return null;

  return {
    href: normalizedPath,
    visitedAt: '',
    title: bestMatch.title,
    subtitle: bestMatch.ancestors.at(-1),
    iconKey: getStaticIconKey(normalizedPath),
    badges: [],
  };
}

export function resolveRecentSidebarEntry(
  entry: RecentSidebarEntry,
  links: (NavLink | null)[],
  labels: RecentSidebarLabels
): ResolvedRecentSidebarItem | null {
  const routeItem = resolveRecentSidebarItem(entry.href, links, labels);
  const normalizedHref = normalizePath(entry.href);

  if (!routeItem && !entry.snapshot) {
    return null;
  }

  return {
    href: normalizedHref,
    visitedAt: entry.visitedAt,
    title: entry.snapshot?.title?.trim() || routeItem?.title || normalizedHref,
    subtitle:
      entry.snapshot?.subtitle?.trim() || routeItem?.subtitle || undefined,
    iconKey:
      entry.snapshot?.iconKey ||
      routeItem?.iconKey ||
      getStaticIconKey(normalizedHref),
    badges: entry.snapshot?.badges
      ? resolveSnapshotBadges(entry.snapshot.badges, labels)
      : routeItem?.badges || [],
  };
}

export function upsertRecentSidebarEntry(
  entries: RecentSidebarEntry[],
  entryOrHref: RecentSidebarEntry | string,
  visitedAt?: string
): RecentSidebarEntry[] {
  const nextEntry =
    typeof entryOrHref === 'string'
      ? {
          href: normalizePath(entryOrHref),
          visitedAt: visitedAt ?? new Date().toISOString(),
        }
      : {
          ...entryOrHref,
          href: normalizePath(entryOrHref.href),
          visitedAt:
            entryOrHref.visitedAt || visitedAt || new Date().toISOString(),
        };
  const normalizedHref = nextEntry.href;
  const previousEntry = entries.find(
    (entry) => normalizePath(entry.href) === normalizedHref
  );
  const nextEntries = [
    {
      ...previousEntry,
      ...nextEntry,
      snapshot:
        nextEntry.snapshot || previousEntry?.snapshot
          ? {
              ...(previousEntry?.snapshot ?? {}),
              ...(nextEntry.snapshot ?? {}),
            }
          : undefined,
    },
    ...entries.filter((entry) => normalizePath(entry.href) !== normalizedHref),
  ];

  return nextEntries.slice(0, MAX_RECENT_SIDEBAR_ITEMS);
}

export function removeRecentSidebarEntry(
  entries: RecentSidebarEntry[],
  href: string
): RecentSidebarEntry[] {
  const normalizedHref = normalizePath(href);
  return entries.filter(
    (entry) => normalizePath(entry.href) !== normalizedHref
  );
}

export function normalizeRecentSidebarEntries(
  entries: RecentSidebarEntry[],
  options?: {
    currentPathname?: string;
    wsId?: string;
  }
): RecentSidebarEntry[] {
  return entries.reduce<RecentSidebarEntry[]>((acc, entry) => {
    const normalizedHref = normalizeRecentSidebarHref(entry.href, options);
    return upsertRecentSidebarEntry(acc, {
      ...entry,
      href: normalizedHref,
    });
  }, []);
}
