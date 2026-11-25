import { PencilRuler } from '@tuturuuu/icons';
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
      title: t('sidebar_tabs.whiteboards'),
      href: `/${personalOrWsId}`,
      aliases: [`/${personalOrWsId}/*`],
      icon: <PencilRuler className="h-4 w-4" />,
      matchExact: false,
    },
  ];
}
