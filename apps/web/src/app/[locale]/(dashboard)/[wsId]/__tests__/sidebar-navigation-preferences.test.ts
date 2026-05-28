import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { describe, expect, it } from 'vitest';
import {
  applySidebarNavigationPreferences,
  createSidebarNavigationLayoutConfigForHiddenState,
  createSidebarNavigationLayoutConfigForPlacement,
  normalizeSidebarNavigationLayoutConfig,
  promoteArchivedWhenMoreToolsOnlyHasArchive,
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
    preferenceSectionLabel: 'Work tools',
  },
  {
    id: 'more_tools',
    title: 'More tools',
    children: [
      {
        id: 'users',
        title: 'Users',
        href: '/personal/users',
        preferenceSectionLabel: 'Operations',
      },
      null,
      {
        id: 'inventory',
        title: 'Inventory',
        href: '/personal/inventory',
        preferenceSectionLabel: 'Operations',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    href: '/personal/settings',
    preferenceLocked: true,
    preferencePlacement: 'root',
    preferenceSectionLabel: 'Utilities',
  },
];

function visibleIds(navLinks: (NavLink | null)[]) {
  return navLinks
    .filter((link): link is NavLink => Boolean(link))
    .map((link) => link.id);
}

function moreChildIds(navLinks: (NavLink | null)[]) {
  const more = navLinks.find((link) => link?.id === 'more_tools');
  return more?.children ? visibleIds(more.children) : [];
}

describe('sidebar navigation preferences', () => {
  it('defaults root navigation to Dashboard, core tools, More tools, then Settings', () => {
    const result = applySidebarNavigationPreferences(links, null);

    expect(visibleIds(result.links)).toEqual([
      'dashboard',
      'tasks',
      'calendar',
      'finance',
      'more_tools',
      'settings',
    ]);
    expect(moreChildIds(result.links)).toEqual(['forms', 'users', 'inventory']);
    expect(result.links.map((link) => link?.id ?? null)).toEqual([
      'dashboard',
      null,
      'tasks',
      'calendar',
      'finance',
      null,
      'more_tools',
      null,
      'settings',
    ]);
    expect(
      result.links
        .find((link) => link?.id === 'more_tools')
        ?.children?.filter((link): link is NavLink => Boolean(link))
        .map((link) => link.sectionLabel)
    ).toEqual(['Work tools', 'Operations', 'Operations']);
  });

  it('applies placement, ordering, hiding, and ignores stale ids', () => {
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
      'finance',
      'tasks',
      'more_tools',
      'settings',
    ]);
    expect(moreChildIds(result.links)).toEqual([
      'calendar',
      'users',
      'inventory',
    ]);
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

    const more = result.links.find((link) => link?.id === 'more_tools');
    const activeHidden = more?.children?.find((link) => link?.id === 'forms');

    expect(activeHidden).toMatchObject({
      id: 'forms',
      preferenceHiddenActive: true,
    });
    expect(result.archivedLinks.map((link) => link.id)).toEqual(['forms']);
    expect(result.normalizedConfig.hidden).toEqual(['forms']);
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

  it('keeps More tools available when all More children are archived', () => {
    const result = applySidebarNavigationPreferences(links, {
      hidden: ['forms', 'users', 'inventory'],
    });

    expect(visibleIds(result.links)).toEqual([
      'dashboard',
      'tasks',
      'calendar',
      'finance',
      'more_tools',
      'settings',
    ]);
    expect(moreChildIds(result.links)).toEqual([]);
    expect(result.archivedLinks.map((link) => link.id)).toEqual([
      'forms',
      'users',
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

describe('promoteArchivedWhenMoreToolsOnlyHasArchive', () => {
  const archivedLink: NavLink = {
    id: 'archived_navigation',
    title: 'Archived',
    href: '/personal/archived',
  };

  it('promotes Archived to root when More Tools has only Archived', () => {
    const links: (NavLink | null)[] = [
      {
        id: 'more_tools',
        title: 'More tools',
        children: [archivedLink],
      },
    ];

    expect(promoteArchivedWhenMoreToolsOnlyHasArchive(links)).toEqual([
      archivedLink,
    ]);
  });

  it('promotes Archived to root when More Tools has a separator and Archived', () => {
    const links: (NavLink | null)[] = [
      {
        id: 'more_tools',
        title: 'More tools',
        children: [null, archivedLink],
      },
    ];

    expect(promoteArchivedWhenMoreToolsOnlyHasArchive(links)).toEqual([
      archivedLink,
    ]);
  });

  it('keeps More Tools grouped when it has other visible children', () => {
    const tasksLink: NavLink = {
      id: 'tasks',
      title: 'Tasks',
      href: '/personal/tasks',
    };
    const moreTools: NavLink = {
      id: 'more_tools',
      title: 'More tools',
      children: [tasksLink, archivedLink],
    };
    const links: (NavLink | null)[] = [moreTools];

    expect(promoteArchivedWhenMoreToolsOnlyHasArchive(links)).toEqual([
      moreTools,
    ]);
  });
});
