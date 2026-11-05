import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  Plus,
  RefreshCcw,
  Target,
  TrendingUp,
  Trophy,
  UserStar,
} from '@tuturuuu/icons';
import { createWorkspaceMembersNavLink } from '@tuturuuu/satellite/workspace-settings';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';
import { createElement } from 'react';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

type NavigationTranslator = Parameters<typeof createWorkspaceMembersNavLink>[0];

export interface NavigationAccess {
  /** Cycles require `manage_projects`, matching the Cycles page guard. */
  canManageCycles?: boolean;
}

export async function getNavigationLinks({
  personalOrWsId,
  access,
}: {
  personalOrWsId: string;
  access?: NavigationAccess;
}): Promise<(NavLink | null)[]> {
  return buildNavigationLinks(await getTranslations(), personalOrWsId, access);
}

/**
 * The workspace sidebar links for a translator, shared by the Next layout and
 * the native Start shell (which translates on the client).
 */
export function buildNavigationLinks(
  t: NavigationTranslator,
  personalOrWsId: string,
  access: NavigationAccess = {}
): (NavLink | null)[] {
  return [
    {
      title: t('sidebar_tabs.tasks'),
      href: `/${personalOrWsId}/tasks`,
      icon: createElement(UserStar, { className: 'h-4 w-4' }),
      children: [
        {
          title: t('task-plan.title'),
          href: `/${personalOrWsId}/tasks/new`,
          icon: createElement(Plus, { className: 'h-4 w-4' }),
        },
        {
          title: t('sidebar_tabs.cycles'),
          href: `/${personalOrWsId}/cycles`,
          icon: createElement(RefreshCcw, { className: 'h-4 w-4' }),
          matchExact: true,
          disabled: !access.canManageCycles,
        },
        {
          title: t('sidebar_tabs.cycles_planning'),
          href: `/${personalOrWsId}/cycles/planning`,
          icon: createElement(CalendarRange, { className: 'h-4 w-4' }),
          aliases: [`/${personalOrWsId}/cycles/planning/*`],
          disabled: !access.canManageCycles,
        },
      ],
      aliases: [
        `/${personalOrWsId}/tasks/*`,
        `/${personalOrWsId}/boards`,
        `/${personalOrWsId}/boards/*`,
        `/${personalOrWsId}/cycles`,
        `/${personalOrWsId}/cycles/*`,
      ],
    },
    {
      title: t('sidebar_tabs.calendar'),
      href: `/${personalOrWsId}/calendar`,
      icon: createElement(CalendarDays, { className: 'h-4 w-4' }),
      aliases: [`/${personalOrWsId}/calendar/*`],
    },
    null,
    {
      title: t('task-progress.views.progress.title'),
      href: `/${personalOrWsId}/progress`,
      icon: createElement(TrendingUp, { className: 'h-4 w-4' }),
      aliases: [`/${personalOrWsId}/progress/*`],
    },
    {
      title: t('task-progress.views.goals.title'),
      href: `/${personalOrWsId}/goals`,
      icon: createElement(Target, { className: 'h-4 w-4' }),
      aliases: [`/${personalOrWsId}/goals/*`],
    },
    {
      title: t('task-progress.views.stats.title'),
      href: `/${personalOrWsId}/analytics`,
      icon: createElement(BarChart3, { className: 'h-4 w-4' }),
      aliases: [`/${personalOrWsId}/analytics/*`],
    },
    {
      title: t('task-progress.views.leaderboards.title'),
      href: `/${personalOrWsId}/leaderboard`,
      icon: createElement(Trophy, { className: 'h-4 w-4' }),
      aliases: [`/${personalOrWsId}/leaderboard/*`],
    },
    null,
    createWorkspaceMembersNavLink(t),
  ];
}
