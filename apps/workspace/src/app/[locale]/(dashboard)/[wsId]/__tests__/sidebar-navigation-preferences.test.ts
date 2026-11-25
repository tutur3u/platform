import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { describe, expect, it } from 'vitest';
import {
  appendArchivedNavigationLink,
  applySidebarNavigationPreferences,
  createSidebarNavigationLayoutConfigForHiddenState,
  createSidebarNavigationLayoutConfigForPlacement,
  normalizeSidebarNavigationLayoutConfig,
} from '../sidebar-navigation-preferences';

const links: (NavLink | null)[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    href: '/personal',
    preferenceLocked: true,
    preferencePlacement: 'root',
  },
  null,
  {
    id: 'tasks',
    title: 'Tasks',
    href: '/personal/tasks',
    preferencePlacement: 'root',
  },
  {
    id: 'calendar',
    title: 'Calendar',
    href: '/personal/calendar',
    preferencePlacement: 'root',
  },
  {
    id: 'finance',
    title: 'Finance',
    href: '/personal/finance',
    preferencePlacement: 'root',
  },
  {
    id: 'forms',
    title: 'Forms',
    href: '/personal/forms',
  },
  {
    id: 'more_tools',
    title: 'More tools',
    children: [
      {
        id: 'users',
        title: 'Users',
        href: '/personal/users',
      },
      null,
      {
        id: 'inventory',
        title: 'Inventory',
        href: '/personal/inventory',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    href: '/personal/settings',
    preferenceLocked: true,
    preferencePlacement: 'root',
  },
];

function visibleIds(navLinks: (NavLink | null)[]) {
  return navLinks
    .filter((link): link is NavLink => Boolean(link))
    .map((link) => link.id);
}

const categoryLabels = {
  ai: 'AI',
  communication: 'Communication',
  files_content: 'Files & Content',
  operations: 'Finance & Operations',
  overview: 'Overview',
  productivity: 'Productivity',
  utilities: 'Utilities',
};

function sectionHeaders(navLinks: (NavLink | null)[]) {
  const headers: (string | undefined)[] = [];
  let previous: string | undefined;

  for (const link of navLinks) {
    if (!link) continue;
    if (link.sectionId !== previous) headers.push(link.sectionLabel);
    previous = link.sectionId;
  }

  return headers;
}

describe('sidebar navigation preferences', () => {
  it('lays out one flat list grouped by category, with Settings as the footer', () => {
    const result = applySidebarNavigationPreferences(links, null, {
      categoryLabels,
    });

    expect(result.links.map((link) => link?.id ?? null)).toEqual([
      'dashboard',
      'tasks',
      'calendar',
      'forms',
      'finance',
      'inventory',
      'users',
      null,
      'settings',
    ]);
    expect(result.links.some((link) => link?.id === 'more_tools')).toBe(false);
    expect(sectionHeaders(result.links.slice(0, -2))).toEqual([
      undefined,
      'Productivity',
      'Finance & Operations',
      'Utilities',
    ]);
    expect(result.rootIds).toEqual(['tasks', 'calendar', 'finance']);
    expect(result.moreIds).toEqual(['forms', 'users', 'inventory']);
  });

  it('never repeats a section header, however the saved order interleaves apps', () => {
    const result = applySidebarNavigationPreferences(
      links,
      {
        root: ['finance', 'tasks', 'users'],
        more: ['inventory', 'forms', 'calendar'],
      },
      { categoryLabels }
    );
    const headers = sectionHeaders(result.links.slice(0, -2));

    expect(new Set(headers).size).toBe(headers.length);
    expect(result.links.map((link) => link?.sectionId)).toEqual([
      'overview',
      'productivity',
      'productivity',
      'productivity',
      'operations',
      'operations',
      'utilities',
      undefined,
      undefined,
    ]);
  });

  it('marks the overview section as header-less and non-collapsible', () => {
    const [dashboard, , , , , , , , settings] =
      applySidebarNavigationPreferences(links, null, { categoryLabels }).links;

    expect(dashboard).toMatchObject({
      sectionCollapsible: false,
      sectionId: 'overview',
      sectionLabel: undefined,
    });
    expect(settings?.sectionId).toBeUndefined();
  });

  it('applies saved order within a category, hiding, and ignores stale ids', () => {
    const result = applySidebarNavigationPreferences(
      links,
      JSON.stringify({
        root: ['finance', 'missing', 'tasks'],
        more: ['calendar', 'settings'],
        hidden: ['dashboard', 'forms', 'unknown'],
      })
    );

    expect(visibleIds(result.links)).toEqual([
      'dashboard',
      'tasks',
      'calendar',
      'finance',
      'inventory',
      'users',
      'settings',
    ]);
    expect(result.rootIds).toEqual(['finance', 'tasks']);
    expect(result.moreIds).toEqual(['calendar', 'users', 'inventory']);
    expect(result.normalizedConfig.hidden).toEqual(['forms']);
  });

  it('reveals a hidden active item without saving it back into the normalized config', () => {
    const result = applySidebarNavigationPreferences(
      links,
      {
        hidden: ['forms'],
      },
      {
        pathname: '/personal/forms/submissions',
      }
    );

    const activeHidden = result.links.find((link) => link?.id === 'forms');

    expect(activeHidden).toMatchObject({
      id: 'forms',
      preferenceHiddenActive: true,
    });
    expect(result.archivedLinks.map((link) => link.id)).toEqual(['forms']);
    expect(result.normalizedConfig.hidden).toEqual(['forms']);
  });

  it('reveals a hidden exact item when a wildcard alias matches', () => {
    const taskBoardLinks = links.map((link) =>
      link?.id === 'tasks'
        ? {
            ...link,
            aliases: ['/personal/tasks/boards/*'],
            matchExact: true,
          }
        : link
    );
    const result = applySidebarNavigationPreferences(
      taskBoardLinks,
      {
        hidden: ['tasks'],
      },
      {
        pathname: '/personal/tasks/boards/board-1',
      }
    );

    const activeHidden = result.links.find((link) => link?.id === 'tasks');

    expect(activeHidden).toMatchObject({
      id: 'tasks',
      preferenceHiddenActive: true,
    });
    expect(result.archivedLinks.map((link) => link.id)).toEqual(['tasks']);
    expect(result.normalizedConfig.hidden).toEqual(['tasks']);
  });

  it('keeps a hidden external Mail app link archived on matching local paths', () => {
    const result = applySidebarNavigationPreferences(
      [
        {
          id: 'dashboard',
          title: 'Dashboard',
          href: '/personal',
          preferenceLocked: true,
          preferencePlacement: 'root',
        },
        {
          id: 'mail',
          title: 'Mail',
          href: 'https://mail.tuturuuu.com/personal',
          external: true,
        },
      ],
      {
        hidden: ['mail'],
      },
      {
        pathname: '/personal',
      }
    );

    expect(visibleIds(result.links)).toEqual(['dashboard']);
    expect(result.archivedLinks.map((link) => link.id)).toEqual(['mail']);
    expect(
      result.links.some(
        (link) => link?.id === 'mail' || link?.preferenceHiddenActive
      )
    ).toBe(false);
  });

  it('drops a section entirely once all of its apps are archived', () => {
    const result = applySidebarNavigationPreferences(links, {
      hidden: ['finance', 'inventory'],
    });

    expect(result.links.some((link) => link?.sectionId === 'operations')).toBe(
      false
    );
    expect(result.archivedLinks.map((link) => link.id)).toEqual([
      'finance',
      'inventory',
    ]);
  });

  it('normalizes duplicate and malformed preference payloads', () => {
    expect(
      normalizeSidebarNavigationLayoutConfig({
        root: ['tasks', 'tasks', 1],
        more: ['calendar', '', 'finance'],
        hidden: ['forms', 'forms', null],
      })
    ).toEqual({
      root: ['tasks'],
      more: ['calendar', 'finance'],
      hidden: ['forms'],
    });
  });

  it('creates a saved config that keeps Settings pinned as a footer item', () => {
    expect(
      createSidebarNavigationLayoutConfigForPlacement(
        links,
        null,
        'forms',
        'root'
      )
    ).toEqual({
      hidden: [],
      more: ['users', 'inventory'],
      root: ['tasks', 'calendar', 'finance', 'forms'],
    });
  });

  it('does not create a saved config that unpins locked root items into More tools', () => {
    expect(
      createSidebarNavigationLayoutConfigForPlacement(
        links,
        {
          root: ['settings', 'tasks'],
          more: ['settings', 'calendar'],
          hidden: ['dashboard', 'settings'],
        },
        'settings',
        'more'
      )
    ).toEqual({
      hidden: [],
      more: ['calendar'],
      root: ['tasks'],
    });
  });

  it('creates a saved config that archives and restores items', () => {
    const archived = createSidebarNavigationLayoutConfigForHiddenState(
      links,
      null,
      'forms',
      true
    );

    expect(archived).toEqual({
      hidden: ['forms'],
      more: ['forms', 'users', 'inventory'],
      root: ['tasks', 'calendar', 'finance'],
    });
    expect(
      createSidebarNavigationLayoutConfigForHiddenState(
        links,
        archived,
        'forms',
        false
      )
    ).toEqual({
      hidden: [],
      more: ['forms', 'users', 'inventory'],
      root: ['tasks', 'calendar', 'finance'],
    });
  });
});

describe('appendArchivedNavigationLink', () => {
  const archivedLink: NavLink = {
    id: 'archived_navigation',
    title: 'Archived',
  };
  const settings: NavLink = {
    id: 'settings',
    title: 'Settings',
    href: '/personal/settings',
  };
  const tasks: NavLink = { id: 'tasks', title: 'Tasks' };

  it('places Archived directly above the Settings footer', () => {
    expect(
      appendArchivedNavigationLink([tasks, null, settings], archivedLink).map(
        (link) => link?.id ?? null
      )
    ).toEqual(['tasks', null, 'archived_navigation', 'settings']);
  });

  it('appends Archived behind a divider when there is no Settings footer', () => {
    expect(
      appendArchivedNavigationLink([tasks], archivedLink).map(
        (link) => link?.id ?? null
      )
    ).toEqual(['tasks', null, 'archived_navigation']);
  });
});
