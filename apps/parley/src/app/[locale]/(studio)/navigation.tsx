import { Compass, History, Plus, Settings2, Sparkles } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export async function getNavigationLinks(
  locale: string,
  isAdministrator: boolean
): Promise<NavLink[]> {
  'use cache';
  const t = await getTranslations({ locale, namespace: 'parley' });
  return [
    {
      title: t('discover'),
      href: '/',
      aliases: ['/scenarios'],
      icon: <Compass className="size-4" />,
    },
    {
      title: t('new_session'),
      href: '/sessions/new',
      icon: <Plus className="size-4" />,
    },
    {
      title: t('sessions'),
      href: '/sessions',
      icon: <History className="size-4" />,
    },
    ...(isAdministrator
      ? [
          {
            title: t('manage_scenarios'),
            href: '/manage/scenarios',
            icon: <Settings2 className="size-4" />,
          },
        ]
      : []),
    {
      title: t('ai_credits'),
      href: 'https://ai.tuturuuu.com/personal/credits',
      icon: <Sparkles className="size-4" />,
    },
  ];
}
