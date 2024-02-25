import { NavLink, Navigation } from '@/components/navigation';
import { Separator } from '@/components/ui/separator';
import { getSecret, getSecrets, getWorkspace } from '@/lib/workspace-helper';
import useTranslation from 'next-translate/useTranslation';
import FleetingNavigator from './fleeting-navigator';

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

  const secrets = await getSecrets({
    wsId,
    requiredSecrets: [
      'ENABLE_CHAT',
      'ENABLE_CALENDAR',
      'ENABLE_USERS',
      'ENABLE_PROJECTS',
      'ENABLE_INVENTORY',
      'ENABLE_HEALTHCARE',
      'ENABLE_FINANCE',
    ],
    forceAdmin: true,
  });

  const verifySecret = (secret: string, value: string) =>
    getSecret(secret, secrets)?.value === value;

  const navLinks: NavLink[] = [
    {
      name: t('chat'),
      href: `/${wsId}/chat`,
      disabled: !verifySecret('ENABLE_CHAT', 'true'),
    },
    {
      name: t('common:dashboard'),
      href: `/${wsId}`,
      matchExact: true,
    },
    {
      name: t('calendar'),
      href: `/${wsId}/calendar`,
      disabled: !verifySecret('ENABLE_CALENDAR', 'true'),
    },
    {
      name: t('projects'),
      href: `/${wsId}/projects`,
      allowedPresets: ['ALL'],
      disabled: !verifySecret('ENABLE_PROJECTS', 'true'),
    },
    {
      name: t('documents'),
      href: `/${wsId}/documents`,
      allowedPresets: ['ALL'],
      disabled: true,
    },
    {
      name: t('users'),
      href: `/${wsId}/users`,
      disabled: !verifySecret('ENABLE_USERS', 'true'),
    },
    {
      name: t('inventory'),
      href: `/${wsId}/inventory`,
      disabled: !verifySecret('ENABLE_INVENTORY', 'true'),
    },
    {
      name: t('healthcare'),
      href: `/${wsId}/healthcare`,
      allowedPresets: ['ALL', 'PHARMACY'],
      disabled: !verifySecret('ENABLE_HEALTHCARE', 'true'),
    },
    {
      name: t('finance'),
      href: `/${wsId}/finance`,
      disabled: !verifySecret('ENABLE_FINANCE', 'true'),
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
      {verifySecret('ENABLE_CHAT', 'true') && <FleetingNavigator wsId={wsId} />}
    </>
  );
}
