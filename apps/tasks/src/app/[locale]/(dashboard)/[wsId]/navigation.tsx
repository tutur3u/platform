import { UserStar } from '@tuturuuu/icons';
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
  ];
}
