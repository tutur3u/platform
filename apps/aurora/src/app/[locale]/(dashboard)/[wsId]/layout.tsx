import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import InvitationCard from './invitation-card';
import { Structure } from './structure';
import type { NavLink } from '@/components/navigation';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { getCurrentUser } from '@/lib/user-helper';
import {
  getPermissions,
  getWorkspace,
  verifySecret,
} from '@/lib/workspace-helper';
import {
  Archive,
  Banknote,
  Calendar,
  ChartArea,
  CircleCheck,
  Cog,
  FileText,
  GraduationCap,
  HardDrive,
  Mail,
  MessageCircleIcon,
  Presentation,
  Sparkles,
  Users,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations();
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  const navLinks: NavLink[] = [
    {
      title: t('sidebar_tabs.chat_with_ai'),
      href: `/${wsId}/chat`,
      icon: <MessageCircleIcon className="h-4 w-4" />,
      disabled:
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_CHAT',
          value: 'true',
        })) || withoutPermission('ai_chat'),
      shortcut: 'X',
      experimental: 'beta',
    },
    {
      title: t('common.dashboard'),
      href: `/${wsId}`,
      icon: <ChartArea className="h-4 w-4" />,
      matchExact: true,
      shortcut: 'D',
    },
    {
      title: t('sidebar_tabs.ai'),
      href: `/${wsId}/ai`,
      icon: <Sparkles className="h-4 w-4" />,
      disabled:
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_AI',
          value: 'true',
        })) || withoutPermission('ai_lab'),
      shortcut: 'A',
      experimental: 'beta',
    },
    {
      title: t('sidebar_tabs.education'),
      href: `/${wsId}/education`,
      icon: <GraduationCap className="h-4 w-4" />,
      disabled:
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        })) || withoutPermission('ai_lab'),
      shortcut: 'A',
      experimental: 'alpha',
    },
    {
      title: t('sidebar_tabs.slides'),
      href: `/${wsId}/slides`,
      icon: <Presentation className="h-4 w-4" />,
      disabled: !(await verifySecret({
        forceAdmin: true,
        wsId,
        name: 'ENABLE_SLIDES',
        value: 'true',
      })),
      shortcut: 'S',
      experimental: 'beta',
    },
    {
      title: t('sidebar_tabs.mail'),
      href:
        wsId === ROOT_WORKSPACE_ID ? `/${wsId}/mail` : `/${wsId}/mail/posts`,
      icon: <Mail className="h-4 w-4" />,
      disabled:
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EMAIL_SENDING',
          value: 'true',
        })) || withoutPermission('send_user_group_post_emails'),
      shortcut: 'M',
      experimental: 'beta',
    },
    {
      title: t('sidebar_tabs.calendar'),
      href: `/${wsId}/calendar`,
      icon: <Calendar className="h-4 w-4" />,
      disabled: withoutPermission('manage_calendar'),
      shortcut: 'C',
      experimental: 'alpha',
    },
    {
      title: t('sidebar_tabs.tasks'),
      href: `/${wsId}/tasks/boards`,
      icon: <CircleCheck className="h-4 w-4" />,
      disabled:
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_TASKS',
          value: 'true',
        })) || withoutPermission('manage_projects'),
      shortcut: 'T',
      experimental: 'alpha',
    },
    {
      title: t('sidebar_tabs.documents'),
      href: `/${wsId}/documents`,
      icon: <FileText className="h-4 w-4" />,
      disabled:
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_DOCS',
          value: 'true',
        })) || withoutPermission('manage_documents'),
      shortcut: 'O',
      experimental: 'beta',
    },
    {
      title: t('sidebar_tabs.drive'),
      href: `/${wsId}/drive`,
      icon: <HardDrive className="h-4 w-4" />,
      disabled:
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_DRIVE',
          value: 'true',
        })) || withoutPermission('manage_drive'),
      shortcut: 'R',
      experimental: 'beta',
    },
    {
      title: t('sidebar_tabs.users'),
      aliases: [`/${wsId}/users`],
      href: `/${wsId}/users/database`,
      icon: <Users className="h-4 w-4" />,
      disabled: withoutPermission('manage_users'),
      shortcut: 'U',
    },
    {
      title: t('sidebar_tabs.inventory'),
      href: `/${wsId}/inventory`,
      icon: <Archive className="h-4 w-4" />,
      disabled: withoutPermission('manage_inventory'),
      shortcut: 'I',
    },
    {
      title: t('sidebar_tabs.finance'),
      aliases: [`/${wsId}/finance`],
      href: `/${wsId}/finance/transactions`,
      icon: <Banknote className="h-4 w-4" />,
      disabled: withoutPermission('manage_finance'),
      shortcut: 'F',
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
      shortcut: ',',
    },
  ];

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  const layout = (await cookies()).get('react-resizable-panels:layout:default');
  const collapsed = (await cookies()).get('react-resizable-panels:collapsed');

  const defaultLayout = layout ? JSON.parse(layout.value) : undefined;
  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  if (!workspace) redirect('/onboarding');
  if (!workspace?.joined)
    return (
      <div className="flex h-screen w-screen items-center justify-center p-2 md:p-4">
        <InvitationCard workspace={workspace} />
      </div>
    );

  return (
    <>
      <Structure
        wsId={wsId}
        user={user}
        workspace={workspace}
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

      {/* {(await verifySecret({
        forceAdmin: true,
        wsId,
        name: 'ENABLE_CHAT',
        value: 'true',
      })) && <FleetingNavigator wsId={wsId} />} */}
    </>
  );
}
