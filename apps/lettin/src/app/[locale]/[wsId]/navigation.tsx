import {
  BookOpen,
  Compass,
  Feather,
  Library,
  Palette,
  Shield,
  Sparkles,
  UserRound,
} from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { bindings } from '@/server/bindings';
import { isCreator } from '@/server/context';
export async function getNavigationLinks(
  wsId: string,
  actorId: string
): Promise<NavLink[]> {
  const t = await getTranslations('lettin');
  const [permissions, root] = await Promise.all([
    getPermissions({ user: { id: actorId }, wsId }),
    getPermissions({
      user: { id: actorId },
      wsId: '00000000-0000-0000-0000-000000000000',
    }),
  ]);
  const canModerate =
    permissions?.membershipType === 'MEMBER' &&
    permissions.containsPermission('manage_documents') &&
    (await isCreator((await bindings()).db, {
      id: actorId,
      isAdmin:
        root?.membershipType === 'MEMBER' && root.containsPermission('admin'),
    }));
  return [
    {
      title: t('myWorlds'),
      href: `/${wsId}`,
      icon: <BookOpen className="size-4" />,
      matchExact: true,
      aliases: [],
      children: [],
    },
    {
      title: t('wikiLibrary'),
      href: `/${wsId}/wiki`,
      icon: <Library className="size-4" />,
      aliases: [`/${wsId}/wiki`, `/${wsId}/worlds`],
      children: [],
    },
    {
      title: t('creatorProfile'),
      href: `/${wsId}/profile`,
      icon: <UserRound className="size-4" />,
      aliases: [`/${wsId}/profile`],
      children: [],
    },
    ...(canModerate
      ? [
          {
            title: t('moderation'),
            href: `/${wsId}/moderation`,
            icon: <Shield className="size-4" />,
            aliases: [`/${wsId}/moderation`],
            children: [],
          },
        ]
      : []),
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
      aliases: [`/${wsId}/spaces/${space}`],
      children: [],
    })),
    {
      title: t('creativeToolkit'),
      href: `/${wsId}/toolkit`,
      icon: <Sparkles className="size-4" />,
      aliases: [`/${wsId}/toolkit`],
      children: [],
    },
  ];
}
