import {
  Eye,
  FileText,
  Gamepad2,
  LayoutDashboard,
  ShieldUser,
  Users,
} from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getTranslations } from 'next-intl/server';
import { getCmsGamesEnabled } from '@/lib/cms-games';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  personalOrWsId,
  workspaceId,
}: {
  personalOrWsId: string;
  workspaceId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();
  const isInternalWorkspace = workspaceId === ROOT_WORKSPACE_ID;
  const cmsGamesEnabled = isInternalWorkspace
    ? false
    : await getCmsGamesEnabled(workspaceId);

  if (isInternalWorkspace) {
    return [
      {
        title: t('common.projects'),
        href: `/${personalOrWsId}/projects`,
        icon: <ShieldUser className="h-4 w-4" />,
        matchExact: true,
      },
    ];
  }

  return [
    {
      title: t('common.dashboard'),
      href: `/${personalOrWsId}`,
      icon: <LayoutDashboard className="h-4 w-4" />,
      matchExact: true,
    },
    {
      title: t('common.library'),
      href: `/${personalOrWsId}/library`,
      icon: <FileText className="h-4 w-4" />,
      aliases: [
        `/${personalOrWsId}/library`,
        `/${personalOrWsId}/library/entries`,
        `/${personalOrWsId}/library/collections`,
      ],
    },
    cmsGamesEnabled
      ? {
          title: t('external-projects.settings.cms_games_nav_title'),
          href: `/${personalOrWsId}/games`,
          icon: <Gamepad2 className="h-4 w-4" />,
          aliases: [`/${personalOrWsId}/games`],
        }
      : null,
    {
      title: t('common.preview'),
      href: `/${personalOrWsId}/preview`,
      icon: <Eye className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/preview`],
    },
    {
      title: t('common.members'),
      href: `/${personalOrWsId}/members`,
      icon: <Users className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/members`],
    },
  ];
}
