import { Home, ImagePlay, WandSparkles } from '@tuturuuu/icons';
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
      title: t('common.home'),
      href: `/${personalOrWsId}/new`,
      icon: <Home className="h-4 w-4" />,
      aliases: [`/${personalOrWsId}`],
      matchExact: true,
    },
    {
      title: t('common.tools'),
      href: `/${personalOrWsId}/tools`,
      icon: <WandSparkles className="h-4 w-4" />,
    },
    {
      title: t('common.image_generator'),
      href: `/${personalOrWsId}/imagine`,
      icon: <ImagePlay className="h-4 w-4" />,
    },
  ];

  return navLinks;
}
