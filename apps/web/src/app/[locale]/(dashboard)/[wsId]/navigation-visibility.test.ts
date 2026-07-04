import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import { buildCommandActions } from '@/components/command/utils/command-actions';
import { flattenNavigation } from '@/components/command/utils/use-navigation-data';
import { filterDashboardNavigationLinks } from './navigation-visibility';

describe('filterDashboardNavigationLinks', () => {
  it('removes gated links before command actions are built', () => {
    const links: (NavLink | null)[] = [
      {
        title: 'Root',
        href: '/root',
        requireRootWorkspace: true,
      },
      {
        title: 'Production Hidden',
        href: '/hidden',
        disableOnProduction: true,
      },
      {
        title: 'Employee',
        href: '/employee',
        requireRootMember: true,
      },
      {
        id: 'ai_lab',
        title: 'AI Lab',
        href: '/ai-lab',
        requiredWorkspaceTier: {
          requiredTier: 'PRO',
        },
      },
      {
        id: 'chat',
        title: 'Chat',
        href: '/chat',
        requiredWorkspaceTier: {
          alwaysShow: true,
          requiredTier: 'PLUS',
        },
      },
      {
        id: 'tasks',
        title: 'Tasks',
        href: '/tasks',
      },
    ];

    const visibleLinks = filterDashboardNavigationLinks(links, {
      currentWsId: 'workspace-1',
      prodMode: true,
      userEmail: 'member@example.com',
      workspaceTier: 'FREE',
    });
    const flattened = flattenNavigation(visibleLinks);

    expect(visibleLinks).toEqual([
      expect.objectContaining({
        href: '/chat',
        tempDisabled: true,
      }),
      expect.objectContaining({ href: '/tasks' }),
    ]);
    expect(flattened.map((item) => item.href)).toEqual(['/tasks']);
    expect(
      buildCommandActions(flattened).map((action) => action.targetHref)
    ).not.toContain('/chat');
  });

  it('keeps entitled root and tier-gated links navigable', () => {
    const links: (NavLink | null)[] = [
      {
        title: 'Root',
        href: '/root',
        requireRootWorkspace: true,
      },
      {
        id: 'ai_lab',
        title: 'AI Lab',
        href: '/ai-lab',
        requiredWorkspaceTier: {
          requiredTier: 'PRO',
        },
      },
    ];

    const visibleLinks = filterDashboardNavigationLinks(links, {
      currentWsId: ROOT_WORKSPACE_ID,
      prodMode: true,
      userEmail: 'member@tuturuuu.com',
      workspaceTier: 'PRO',
    });

    expect(flattenNavigation(visibleLinks).map((item) => item.href)).toEqual([
      '/root',
      '/ai-lab',
    ]);
    expect(visibleLinks[1]).toHaveProperty('requiredWorkspaceTier', undefined);
  });

  it('keeps single-child parents when flattening is disabled', () => {
    const links: (NavLink | null)[] = [
      {
        children: [{ href: '/personal/tasks/boards', title: 'Boards' }],
        href: '/personal/tasks',
        title: 'Tasks',
      },
    ];

    const visibleLinks = filterDashboardNavigationLinks(links, {
      currentWsId: 'personal',
      flattenSingleChild: false,
      prodMode: true,
      userEmail: 'member@example.com',
      workspaceTier: 'FREE',
    });

    expect(visibleLinks).toEqual([
      expect.objectContaining({
        children: [expect.objectContaining({ title: 'Boards' })],
        href: '/personal/tasks',
        title: 'Tasks',
      }),
    ]);
  });
});
