import { HardDrive } from '@tuturuuu/icons';
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

  return [
    {
      title: t('sidebar_tabs.drive'),
      href: `/${personalOrWsId}`,
      icon: <HardDrive className="h-4 w-4" />,
      matchExact: true,
    },
    null,
    createWorkspaceMembersNavLink(t),
  ];
}
