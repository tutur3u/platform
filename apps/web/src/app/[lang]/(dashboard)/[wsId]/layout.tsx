import { NavLink, Navigation } from '@/components/navigation';
import { Separator } from '@/components/ui/separator';
import { getWorkspace } from '@/lib/workspace-helper';
import { AI_CHAT_DISABLED_PRESETS } from '@/constants/common';
import useTranslation from 'next-translate/useTranslation';

export const dynamic = 'force-dynamic';

interface LayoutProps {
  params: {
    wsId: string;
  };
  children: React.ReactNode;
}

export default async function Layout({
  children,
  params: { wsId },
}: LayoutProps) {
  const { t } = useTranslation('sidebar-tabs');

  const workspace = await getWorkspace(wsId);

  const navLinks: NavLink[] = [
    {
      name: t('chat'),
      href: `/${wsId}/chat`,
      requireRootWorkspace: true,
      disabledPresets: AI_CHAT_DISABLED_PRESETS,
    },
    {
      name: t('common:dashboard'),
      href: `/${wsId}`,
      matchExact: true,
    },
    {
      name: t('users'),
      href: `/${wsId}/users`,
    },
    {
      name: t('documents'),
      href: `/${wsId}/documents`,
      allowedPresets: ['ALL'],
      disabled: true,
    },
    {
      name: t('boards'),
      href: `/${wsId}/boards`,
      allowedPresets: ['ALL'],
      disabled: true,
    },
    {
      name: t('inventory'),
      href: `/${wsId}/inventory`,
    },
    {
      name: t('healthcare'),
      href: `/${wsId}/healthcare`,
      allowedPresets: ['ALL', 'PHARMACY'],
      disabled: true,
    },
    {
      name: t('finance'),
      href: `/${wsId}/finance`,
    },
    {
      name: t('common:settings'),
      href: `/${wsId}/settings`,
      aliases: [
        `/${wsId}/members`,
        `/${wsId}/teams`,
        `/${wsId}/secrets`,
        `/${wsId}/infrastructure`,
        `/${wsId}/migrations`,
        `/${wsId}/activities`,
      ],
    },
  ];

  return (
    <>
      <div className="px-4 py-2 font-semibold md:px-8 lg:px-16 xl:px-32">
        <div className="scrollbar-none flex gap-1 overflow-x-auto">
          <Navigation
            currentWsId={wsId}
            currentPreset={workspace?.preset ?? 'GENERAL'}
            navLinks={navLinks}
          />
        </div>
      </div>

      <Separator className="opacity-50" />
      <div className="p-4 pt-2 md:px-8 lg:px-16 xl:px-32">{children}</div>
    </>
  );
}
