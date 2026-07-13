import { BarChart3, Goal, TrendingUp, Trophy, UserStar } from '@tuturuuu/icons';
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
    {
      title: t('task-progress.views.progress.title'),
      href: `/${personalOrWsId}/progress`,
      icon: createElement(TrendingUp, { className: 'h-4 w-4' }),
      aliases: [`/${personalOrWsId}/progress/*`],
      children: [
        {
          title: t('task-progress.tabs.goals'),
          href: `/${personalOrWsId}/progress/goals`,
          icon: createElement(Goal, { className: 'h-4 w-4' }),
        },
        {
          title: t('task-progress.tabs.stats'),
          href: `/${personalOrWsId}/progress/stats`,
          icon: createElement(BarChart3, { className: 'h-4 w-4' }),
        },
        {
          title: t('task-progress.tabs.leaderboards'),
          href: `/${personalOrWsId}/progress/leaderboards`,
          icon: createElement(Trophy, { className: 'h-4 w-4' }),
        },
      ],
    },
  ];
}
