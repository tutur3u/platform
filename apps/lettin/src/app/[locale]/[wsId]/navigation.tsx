import { BookOpen } from '@tuturuuu/icons';
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
  ];
}
