import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import FleetingNavigator from './fleeting-navigator';
import { Structure } from './structure';
import type { NavLink } from '@/components/navigation';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
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
import { type ReactNode, Suspense } from 'react';

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
      'ENABLE_TASKS',
      'ENABLE_SLIDES',
      'ENABLE_DOCS',
      'ENABLE_DRIVE',
      'ENABLE_HEALTHCARE',
    ],
    forceAdmin: true,
  });

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  const navLinks: NavLink[] = [
    {
      title: t('sidebar_tabs.chat'),
      href: `/${wsId}/chat`,
      icon: <MessageCircleIcon className="h-4 w-4" />,
      forceRefresh: true,
      disabled:
        !verifySecret('ENABLE_CHAT', 'true', secrets) ||
        withoutPermission('ai_chat'),
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
        withoutPermission('ai_lab'),
    },
    {
      title: t('sidebar_tabs.slides'),
      href: `/${wsId}/slides`,
      icon: <Presentation className="h-4 w-4" />,
      disabled: !verifySecret('ENABLE_SLIDES', 'true', secrets),
    },
    {
      title: t('sidebar_tabs.mail'),
      href:
        wsId === ROOT_WORKSPACE_ID ? `/${wsId}/mail` : `/${wsId}/mail/history`,
      icon: <Mail className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.calendar'),
      href: `/${wsId}/calendar`,
      icon: <Calendar className="h-4 w-4" />,
      disabled: withoutPermission('manage_calendar'),
    },
    {
      title: t('sidebar_tabs.tasks'),
      href: `/${wsId}/tasks/boards`,
      icon: <CheckCheck className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_TASKS', 'true', secrets) ||
        withoutPermission('manage_projects'),
    },
    {
      title: t('sidebar_tabs.documents'),
      href: `/${wsId}/documents`,
      icon: <NotebookPen className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_DOCS', 'true', secrets) ||
        withoutPermission('manage_documents'),
    },
    {
      title: t('sidebar_tabs.drive'),
      href: `/${wsId}/drive`,
      icon: <HardDrive className="h-4 w-4" />,
      disabled:
        !verifySecret('ENABLE_DRIVE', 'true', secrets) ||
        withoutPermission('manage_drive'),
    },
    {
      title: t('sidebar_tabs.users'),
      aliases: [`/${wsId}/users`],
      href: `/${wsId}/users/database`,
      icon: <Users className="h-4 w-4" />,
      disabled: withoutPermission('manage_users'),
    },
    {
      title: t('sidebar_tabs.inventory'),
      href: `/${wsId}/inventory`,
      icon: <Archive className="h-4 w-4" />,
      disabled: withoutPermission('manage_inventory'),
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
      disabled: withoutPermission('manage_finance'),
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

  const layout = cookies().get('react-resizable-panels:layout:default');
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
