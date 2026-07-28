import {
  GitBranch,
  KeyRound,
  Library,
  SquareArrowOutUpRight,
} from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export async function getNavigationLinks({
  permissions,
  workspaceSlug,
}: {
  permissions?: PermissionsResult;
  workspaceSlug: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations('git');
  const disabled =
    permissions?.withoutPermission('manage_git_repositories') ?? true;
  const basePath = `/-/${workspaceSlug}`;

  return [
    {
      disabled,
      href: `${basePath}/repositories`,
      icon: <Library className="h-4 w-4" />,
      matchExact: true,
      title: t('repositories'),
    },
    {
      disabled,
      href: `${basePath}/github-app`,
      icon: <KeyRound className="h-4 w-4" />,
      title: t('github_app'),
    },
    null,
    {
      href: '/tutur3u/platform',
      icon: <GitBranch className="h-4 w-4" />,
      title: 'tutur3u/platform',
    },
    {
      external: true,
      href: 'https://github.com/organizations/tutur3u/settings/apps',
      icon: <SquareArrowOutUpRight className="h-4 w-4" />,
      title: t('github_organization'),
    },
  ];
}
