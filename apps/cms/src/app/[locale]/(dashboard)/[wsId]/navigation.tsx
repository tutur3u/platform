import { Eye, FileText, LayoutDashboard, ShieldUser } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getTranslations } from 'next-intl/server';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  includeAdmin,
  personalOrWsId,
  workspaceId,
}: {
  includeAdmin: boolean;
  personalOrWsId: string;
  workspaceId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();
  const isInternalWorkspace = workspaceId === ROOT_WORKSPACE_ID;

  if (isInternalWorkspace) {
    return [
      {
        title: t('common.admin'),
        href: `/${personalOrWsId}/admin`,
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
      title: t('common.content'),
      href: `/${personalOrWsId}/content`,
      icon: <FileText className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/content`, `/${personalOrWsId}/collections`],
    },
    {
      title: t('common.preview'),
      href: `/${personalOrWsId}/preview`,
      icon: <Eye className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/preview`],
    },
    includeAdmin
      ? {
          title: t('common.admin'),
          href: '/internal/admin',
          icon: <ShieldUser className="h-4 w-4" />,
        }
      : null,
  ];
}
