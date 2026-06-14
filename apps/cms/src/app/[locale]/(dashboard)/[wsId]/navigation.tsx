import {
  Eye,
  FileText,
  Gamepad2,
  ImageIcon,
  LayoutDashboard,
  Package,
  PenSquare,
  ShieldUser,
  Store,
  Tags,
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
        title: t('external-projects.root.sites_nav_title'),
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
      title: t('external-projects.epm.nav_content'),
      href: `/${personalOrWsId}/content`,
      icon: <FileText className="h-4 w-4" />,
      aliases: [
        `/${personalOrWsId}/content`,
        `/${personalOrWsId}/content/entries`,
        `/${personalOrWsId}/content/collections`,
      ],
    },
    {
      title: t('external-projects.epm.nav_pages'),
      href: `/${personalOrWsId}/pages`,
      icon: <PenSquare className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/pages`],
    },
    {
      title: t('external-projects.epm.nav_media'),
      href: `/${personalOrWsId}/media`,
      icon: <ImageIcon className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/media`],
    },
    {
      title: t('external-projects.epm.nav_products'),
      href: `/${personalOrWsId}/products`,
      icon: <Package className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/products`],
    },
    {
      title: t('external-projects.epm.nav_storefront'),
      href: `/${personalOrWsId}/storefront`,
      icon: <Store className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/storefront`],
    },
    {
      title: t('external-projects.epm.nav_taxonomy'),
      href: `/${personalOrWsId}/taxonomy`,
      icon: <Tags className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/taxonomy`],
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
      title: t('external-projects.epm.nav_people'),
      href: `/${personalOrWsId}/members`,
      icon: <Users className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}/members`],
    },
  ];
}
