import { CalendarDays, CheckSquare } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';
import { createElement } from 'react';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  workspaceSlug,
}: {
  workspaceSlug: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations('sidebar_tabs');
  return [
    {
      title: t('calendar'),
      href: `/${workspaceSlug}`,
      matchExact: true,
      icon: createElement(CalendarDays, { className: 'h-4 w-4' }),
    },
    {
      title: t('tasks'),
      href: `/${workspaceSlug}/tasks`,
      aliases: [`/${workspaceSlug}/tasks/*`],
      icon: createElement(CheckSquare, { className: 'h-4 w-4' }),
    },
  ];
}
