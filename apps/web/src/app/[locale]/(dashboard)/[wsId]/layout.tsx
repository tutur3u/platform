import FleetingNavigator from './fleeting-navigator';
import { NavLink, Navigation } from '@/components/navigation';
import { getSecrets, verifySecret } from '@/lib/workspace-helper';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { ReactNode } from 'react';

interface LayoutProps {
  params: {
    wsId: string;
  };
  children: ReactNode;
}

export default async function Layout({
  children,
  params: { wsId },
}: LayoutProps) {
  const t = await getTranslations();

  const secrets = await getSecrets({
    wsId,
    requiredSecrets: [
      'ENABLE_X',
      'ENABLE_AI',
      'ENABLE_CHAT',
      'ENABLE_CALENDAR',
      'ENABLE_USERS',
      'ENABLE_PROJECTS',
      'ENABLE_DOCS',
      'ENABLE_DRIVE',
      'ENABLE_INVENTORY',
      'ENABLE_HEALTHCARE',
    ],
    forceAdmin: true,
  });

  const navLinks: NavLink[] = [
    {
      name: t('sidebar_tabs.x'),
      href: `/${wsId}/x`,
      disabled: !verifySecret('ENABLE_X', 'true', secrets),
      requireRootMember: true,
      requireRootWorkspace: true,
    },
    {
      name: t('sidebar_tabs.chat'),
      href: `/${wsId}/chat`,
      forceRefresh: true,
      disabled: !verifySecret('ENABLE_CHAT', 'true', secrets),
    },
    {
      name: t('common.dashboard'),
      href: `/${wsId}`,
      matchExact: true,
    },
    {
      name: t('sidebar_tabs.ai'),
      href: `/${wsId}/ai`,
      disabled: !verifySecret('ENABLE_AI', 'true', secrets),
    },
    {
      name: t('sidebar_tabs.blackbox'),
      href: `/${wsId}/blackbox`,
      disabled: true,
    },
    {
      name: t('sidebar_tabs.calendar'),
      href: `/${wsId}/calendar`,
      disabled: !verifySecret('ENABLE_CALENDAR', 'true', secrets),
    },
    {
      name: t('sidebar_tabs.projects'),
      href: `/${wsId}/projects`,
      disabled: !verifySecret('ENABLE_PROJECTS', 'true', secrets),
    },
    {
      name: t('sidebar_tabs.documents'),
      href: `/${wsId}/documents`,
      disabled: !verifySecret('ENABLE_DOCS', 'true', secrets),
    },
    {
      name: t('sidebar_tabs.drive'),
      href: `/${wsId}/drive`,
      disabled: !verifySecret('ENABLE_DRIVE', 'true', secrets),
    },
    {
      name: t('sidebar_tabs.users'),
      aliases: [`/${wsId}/users`],
      href: `/${wsId}/users/database`,
      disabled: !verifySecret('ENABLE_USERS', 'true', secrets),
    },
    {
      name: t('sidebar_tabs.inventory'),
      href: `/${wsId}/inventory`,
      disabled: !verifySecret('ENABLE_INVENTORY', 'true', secrets),
    },
    {
      name: t('sidebar_tabs.healthcare'),
      href: `/${wsId}/healthcare`,
      disabled: !verifySecret('ENABLE_HEALTHCARE', 'true', secrets),
    },
    {
      name: t('sidebar_tabs.finance'),
      aliases: [`/${wsId}/finance`],
      href: `/${wsId}/finance/transactions`,
    },
    {
      name: t('common.settings'),
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
      <div className="px-4 pb-2 font-semibold md:px-8 lg:px-16 xl:px-32">
        <div className="scrollbar-none flex gap-1 overflow-x-auto">
          <Navigation currentWsId={wsId} navLinks={navLinks} />
        </div>
      </div>
      <Separator className="opacity-50" />

      <div className="p-4 pt-2 md:px-8 lg:px-16 xl:px-32">{children}</div>
      {verifySecret('ENABLE_CHAT', 'true', secrets) && (
        <FleetingNavigator wsId={wsId} />
      )}
    </>
  );
}
