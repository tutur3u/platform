import { Compass, History, Sparkles } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export async function getNavigationLinks(): Promise<NavLink[]> {
  const t = await getTranslations('parley');
  return [
    {
      title: t('discover'),
      href: '/',
      aliases: ['/scenarios'],
      icon: <Compass className="size-4" />,
    },
    {
      title: t('sessions'),
      href: '/sessions',
      icon: <History className="size-4" />,
    },
    {
      title: t('ai_credits'),
      href: 'https://ai.tuturuuu.com/personal/credits',
      icon: <Sparkles className="size-4" />,
    },
  ];
}
