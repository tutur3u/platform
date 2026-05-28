import { Calendar, Video } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  workspaceSlug,
}: {
  workspaceSlug: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();
  const baseHref = `/workspace/${workspaceSlug}`;

  return [
    {
      title: t('sidebar_tabs.plans'),
      href: `${baseHref}/plans`,
      icon: <Calendar className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.meetings'),
      href: `${baseHref}/meetings`,
      icon: <Video className="h-4 w-4" />,
    },
  ];
}
