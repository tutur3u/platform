import { BookOpen, Compass, Feather, Palette, Sparkles } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
export async function getNavigationLinks(wsId: string) {
  const t = await getTranslations('lettin');
  return [
    {
      title: t('myWorlds'),
      href: `/${wsId}`,
      icon: <BookOpen className="size-4" />,
      aliases: ['worlds', 'wiki', 'characters', 'lore'],
      children: [`/${wsId}/worlds`],
      permission: 'manage_documents' as const,
    },
    ...(
      [
        { space: 'art', icon: Palette },
        { space: 'story', icon: Feather },
        { space: 'world', icon: Compass },
      ] as const
    ).map(({ space, icon: Icon }) => ({
      title: t(`space${space}Title`),
      href: `/${wsId}/spaces/${space}`,
      icon: <Icon className="size-4" />,
      aliases: [`spaces/${space}`],
      children: [],
      permission: 'manage_documents' as const,
    })),
    {
      title: t('creativeToolkit'),
      href: `/${wsId}/toolkit`,
      icon: <Sparkles className="size-4" />,
      aliases: ['toolkit'],
      children: [],
    },
  ];
}
