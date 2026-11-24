import {
  ChartGantt,
  ClipboardClock,
  ClockCheck,
  LayoutDashboard,
  Timer,
} from '@tuturuuu/icons';
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
      title: t('sidebar_tabs.overview'),
      href: `/${personalOrWsId}`,
      icon: <LayoutDashboard className="h-4 w-4" />,
      matchExact: true,
    },
    {
      title: t('sidebar_tabs.timer'),
      href: `/${personalOrWsId}/timer`,
      icon: <Timer className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.history'),
      href: `/${personalOrWsId}/history`,
      icon: <ClipboardClock className="h-4 w-4" />,
    },
    null,
    {
      title: t('sidebar_tabs.management'),
      href: `/${personalOrWsId}/management`,
      icon: <ChartGantt className="h-4 w-4" />,
      requireRootMember: true,
    },
    {
      title: t('sidebar_tabs.requests'),
      href: `/${personalOrWsId}/requests`,
      icon: <ClockCheck className="h-4 w-4" />,
      disabled: personalOrWsId === 'personal',
    },
  ];

  return navLinks;
}
