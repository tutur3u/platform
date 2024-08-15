import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import FleetingNavigator from './fleeting-navigator';
import { Structure } from './structure';
import { NavLink } from '@/components/navigation';
import { getCurrentUser } from '@/lib/user-helper';
import {
  getPermissions,
  getSecrets,
  verifySecret,
} from '@/lib/workspace-helper';
import {
  Archive,
  Banknote,
  Calendar,
  ChartArea,
  CheckCheck,
  Cog,
  Gamepad,
  HardDrive,
  HeartPulse,
  Mail,
  MessageCircleIcon,
  NotebookPen,
  Presentation,
  Sparkles,
  Users,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { ReactNode, Suspense } from 'react';

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
      'ENABLE_SLIDES',
      'ENABLE_MAILBOX',
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

  const { permissions } = await getPermissions({
    wsId,
    requiredPermissions: [
      'ai_chat',
      'ai_lab',
      'manage_calendar',
      'manage_projects',
      'manage_documents',
      'manage_drive',
      'manage_users',
      'manage_inventory',
      'manage_finance',
    ],
  });

  const navLinks: NavLink[] = [
    {
      title: t('sidebar_tabs.chat'),
      href: `/${wsId}/chat`,
      icon: <MessageCircleIcon className="h-4 w-4" />,
      forceRefresh: true,
      disabled:
        !verifySecret('ENABLE_CHAT', 'true', secrets) ||
        !permissions.includes('ai_chat'),
    },
    {
      title: t('common.dashboard'),
      href: `/${wsId}`,
      icon: <ChartArea className="h-4 w-4" />,
      matchExact: true,
    },
    {
      title: t('sidebar_tabs.ai'),
      href: `/${wsId}/ai`,
      icon: <Sparkles className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_AI', 'true', secrets) ||
        !permissions.includes('ai_lab'),
    },
    {
      title: t('sidebar_tabs.blackbox'),
      href: `/${wsId}/blackbox`,
      icon: <Gamepad className="h-4 w-4" />,
      disabled: true,
    },
    {
      title: t('sidebar_tabs.slides'),
      href: `/${wsId}/slides`,
      icon: <Presentation className="h-4 w-4" />,
      disabled: !verifySecret('ENABLE_SLIDES', 'true', secrets),
    },
    {
      title: t('sidebar_tabs.mailbox'),
      href: `/${wsId}/mailbox/send`,
      icon: <Mail className="h-4 w-4" />,
      disabled: !verifySecret('ENABLE_MAILBOX', 'true', secrets),
    },
    {
      title: t('sidebar_tabs.calendar'),
      href: `/${wsId}/calendar`,
      icon: <Calendar className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_CALENDAR', 'true', secrets) ||
        !permissions.includes('manage_calendar'),
    },
    {
      title: t('sidebar_tabs.projects'),
      href: `/${wsId}/projects`,
      icon: <CheckCheck className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_PROJECTS', 'true', secrets) ||
        !permissions.includes('manage_projects'),
    },
    {
      title: t('sidebar_tabs.documents'),
      href: `/${wsId}/documents`,
      icon: <NotebookPen className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_DOCS', 'true', secrets) ||
        !permissions.includes('manage_documents'),
    },
    {
      title: t('sidebar_tabs.drive'),
      href: `/${wsId}/drive`,
      icon: <HardDrive className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_DRIVE', 'true', secrets) ||
        !permissions.includes('manage_drive'),
    },
    {
      title: t('sidebar_tabs.users'),
      aliases: [`/${wsId}/users`],
      href: `/${wsId}/users/database`,
      icon: <Users className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_USERS', 'true', secrets) ||
        !permissions.includes('manage_users'),
    },
    {
      title: t('sidebar_tabs.inventory'),
      href: `/${wsId}/inventory`,
      icon: <Archive className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_INVENTORY', 'true', secrets) ||
        !permissions.includes('manage_inventory'),
    },
    {
      title: t('sidebar_tabs.healthcare'),
      href: `/${wsId}/healthcare`,
      icon: <HeartPulse className="h-4 w-4" />,
      disabled: !verifySecret('ENABLE_HEALTHCARE', 'true', secrets),
    },
    {
      title: t('sidebar_tabs.finance'),
      aliases: [`/${wsId}/finance`],
      href: `/${wsId}/finance/transactions`,
      icon: <Banknote className="h-4 w-4" />,
      disabled: !permissions.includes('manage_finance'),
    },
    {
      title: t('common.settings'),
      href: `/${wsId}/settings`,
      icon: <Cog className="h-4 w-4" />,
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

  const user = await getCurrentUser();

  const layout = cookies().get('react-resizable-panels:layout:mail');
  const collapsed = cookies().get('react-resizable-panels:collapsed');

  const defaultLayout = layout ? JSON.parse(layout.value) : undefined;
  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  return (
    <>
      <Structure
        wsId={wsId}
        user={user}
        defaultLayout={defaultLayout}
        defaultCollapsed={defaultCollapsed}
        navCollapsedSize={4}
        links={navLinks}
        actions={
          <Suspense
            fallback={
              <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
            }
          >
            <NavbarActions />
          </Suspense>
        }
        userPopover={
          <Suspense
            fallback={
              <div className="bg-foreground/5 h-10 w-10 animate-pulse rounded-lg" />
            }
          >
            <UserNav hideMetadata />
          </Suspense>
        }
      >
        {children}
      </Structure>

      {verifySecret('ENABLE_CHAT', 'true', secrets) && (
        <FleetingNavigator wsId={wsId} />
      )}
    </>
  );
}
