import { FileEdit, SquareKanban, UserStar } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export interface NavLink {
  title: string;
  icon?: ReactNode;
  href?: string;
  newTab?: boolean;
  matchExact?: boolean;
  disabled?: boolean;
  isBack?: boolean;
  onClick?: () => void;
  children?: (NavLink | null)[];
  aliases?: string[];
}

export async function getNavigationLinks({
  personalOrWsId,
}: {
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();

  const navLinks: (NavLink | null)[] = [
    {
      title: t('sidebar_tabs.tasks'),
      href: `/${personalOrWsId}/tasks`,
      icon: <UserStar className="h-4 w-4" />,
      matchExact: true,
    },
    {
      title: t('sidebar_tabs.boards'),
      href: `/${personalOrWsId}/tasks/boards`,
      icon: <SquareKanban className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.drafts'),
      href: `/${personalOrWsId}/tasks/drafts`,
      icon: <FileEdit className="h-4 w-4" />,
    },
  ];

  return navLinks;
}
