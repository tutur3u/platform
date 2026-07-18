import {
  BarChart3,
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

export async function getNavigationLinks({
  personalOrWsId,
}: {
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();

  return [
    {
      title: t('sidebar_tabs.tasks'),
      href: `/${personalOrWsId}/tasks`,
      icon: createElement(UserStar, { className: 'h-4 w-4' }),
      aliases: [
        `/${personalOrWsId}/tasks/*`,
        `/${personalOrWsId}/boards`,
        `/${personalOrWsId}/boards/*`,
      ],
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
