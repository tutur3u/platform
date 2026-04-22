import {
  Eye,
  FileText,
  LayoutDashboard,
  ShieldUser,
  Users,
} from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getTranslations } from 'next-intl/server';

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
