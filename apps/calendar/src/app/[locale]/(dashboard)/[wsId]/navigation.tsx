import { CalendarDays } from '@tuturuuu/icons';
import { createWorkspaceMembersNavLink } from '@tuturuuu/satellite/workspace-settings';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  personalOrWsId,
}: {
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();

  const navLinks: (NavLink | null)[] = [
    {
      title: t('sidebar_tabs.calendar'),
      href: `/${personalOrWsId}`,
      icon: <CalendarDays className="h-4 w-4" />,
      matchExact: true,
    },
    null,
    createWorkspaceMembersNavLink(t),
    // null,
    // {
    //   title: t('sidebar_tabs.lab'),
    //   href: `/${personalOrWsId}/lab`,
    //   icon: <FlaskConical className="h-4 w-4" />,
    //   requireRootMember: true,
    // },
  ];

  return navLinks;
}
