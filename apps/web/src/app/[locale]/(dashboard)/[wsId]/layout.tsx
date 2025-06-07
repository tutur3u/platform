import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import InvitationCard from './invitation-card';
import { Structure } from './structure';
import type { NavLink } from '@/components/navigation';
import {
  ROOT_WORKSPACE_ID,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/common';
import { SidebarProvider } from '@/context/sidebar-context';
import {
  getPermissions,
  getWorkspace,
  verifySecret,
} from '@/lib/workspace-helper';
import {
  Archive,
  Banknote,
  Box,
  BriefcaseBusiness,
  Calendar,
  ChartArea,
  CircleCheck,
  Clock,
  ClockFading,
  Cog,
  Database,
  FileText,
  GraduationCap,
  HardDrive,
  Logs,
  Mail,
  MessageCircleIcon,
  PencilLine,
  Play,
  Presentation,
  ScanSearch,
  Sparkles,
  Users,
} from '@tuturuuu/ui/icons';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ReactNode, Suspense } from 'react';

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

  const ENABLE_AI_ONLY = await verifySecret({
    forceAdmin: true,
    wsId,
    name: 'ENABLE_AI_ONLY',
    value: 'true',
  });

  const navLinks: (NavLink | null)[] = [
    {
      title: t('common.dashboard'),
      href: `/${wsId}`,
      icon: <ChartArea className="h-5 w-5" />,
      matchExact: true,
      shortcut: 'D',
    },
    null,
    {
      title: t('sidebar_tabs.ai_tools'),
      icon: <Sparkles className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.chat_with_ai'),
          href: `/${wsId}/chat`,
          icon: <MessageCircleIcon className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_CHAT',
              value: 'true',
            })) ||
            withoutPermission('ai_chat'),
          shortcut: 'X',
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.spark'),
          href: `/${wsId}/ai/spark`,
          icon: <Sparkles className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_TASKS',
              value: 'true',
            })) ||
            withoutPermission('manage_projects'),
          shortcut: 'T',
          experimental: 'alpha',
        },
      ],
    },
    {
      title: t('sidebar_tabs.ai_lab'),
      icon: <Box className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.models'),
          href: `/${wsId}/models`,
          icon: <Box className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_AI',
              value: 'true',
            })) || withoutPermission('ai_lab'),
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.datasets'),
          href: `/${wsId}/datasets`,
          icon: <Database className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_AI',
              value: 'true',
            })) || withoutPermission('ai_lab'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.pipelines'),
          href: `/${wsId}/pipelines`,
          icon: <Play className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_AI',
              value: 'true',
            })) || withoutPermission('ai_lab'),
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.crawlers'),
          href: `/${wsId}/crawlers`,
          icon: <ScanSearch className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_AI',
              value: 'true',
            })) || withoutPermission('ai_lab'),
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.cron'),
          href: `/${wsId}/cron`,
          icon: <Clock className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_AI',
              value: 'true',
            })) || withoutPermission('ai_lab'),
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.queues'),
          href: `/${wsId}/queues`,
          icon: <Logs className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_AI',
              value: 'true',
            })) || withoutPermission('ai_lab'),
          experimental: 'alpha',
        },
      ],
    },
    {
      title: t('sidebar_tabs.productivity'),
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.calendar'),
          href: `/${wsId}/calendar`,
          icon: <Calendar className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_calendar'),
          shortcut: 'C',
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.tasks'),
          href: `/${wsId}/tasks/boards`,
          icon: <CircleCheck className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_TASKS',
              value: 'true',
            })) ||
            withoutPermission('manage_projects'),
          shortcut: 'T',
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.mail'),
          href:
            wsId === ROOT_WORKSPACE_ID
              ? `/${wsId}/mail`
              : `/${wsId}/mail/posts`,
          icon: <Mail className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_EMAIL_SENDING',
              value: 'true',
            })) ||
            withoutPermission('send_user_group_post_emails'),
          shortcut: 'M',
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.whiteboards'),
          href: `/${wsId}/whiteboards`,
          icon: <PencilLine className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_TASKS',
              value: 'true',
            })) ||
            withoutPermission('manage_projects'),
          shortcut: 'T',
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.time_tracker'),
          href: `/${wsId}/time-tracker`,
          icon: <ClockFading className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_TASKS',
              value: 'true',
            })) ||
            withoutPermission('manage_projects'),
          shortcut: 'T',
          experimental: 'beta',
        },
      ],
    },
    {
      title: t('sidebar_tabs.media'),
      icon: <FileText className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.documents'),
          href: `/${wsId}/documents`,
          icon: <FileText className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_DOCS',
              value: 'true',
            })) ||
            withoutPermission('manage_documents'),
          shortcut: 'O',
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.drive'),
          href: `/${wsId}/drive`,
          icon: <HardDrive className="h-5 w-5" />,
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
          title: t('sidebar_tabs.slides'),
          href: `/${wsId}/slides`,
          icon: <Presentation className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_SLIDES',
              value: 'true',
            })),
          shortcut: 'S',
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.education'),
          href: `/${wsId}/education`,
          icon: <GraduationCap className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_EDUCATION',
              value: 'true',
            })) ||
            withoutPermission('ai_lab'),
          shortcut: 'A',
          experimental: 'beta',
        },
      ],
    },
    {
      title: t('sidebar_tabs.management'),
      icon: <Users className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.users'),
          aliases: [`/${wsId}/users`],
          href: `/${wsId}/users/database`,
          icon: <Users className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_users'),
          shortcut: 'U',
        },
        {
          title: t('sidebar_tabs.finance'),
          aliases: [`/${wsId}/finance`],
          href: `/${wsId}/finance/transactions`,
          icon: <Banknote className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_finance'),
          shortcut: 'F',
        },
        {
          title: t('sidebar_tabs.inventory'),
          href: `/${wsId}/inventory`,
          icon: <Archive className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_inventory'),
          shortcut: 'I',
        },
      ],
    },
    null,
    {
      title: t('common.settings'),
      href: `/${wsId}/settings`,
      icon: <Cog className="h-5 w-5" />,
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

  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  const behaviorCookie = (await cookies()).get(SIDEBAR_BEHAVIOR_COOKIE_NAME);

  const rawBehavior = behaviorCookie?.value;
  const isValidBehavior = (
    value: any
  ): value is 'expanded' | 'collapsed' | 'hover' => {
    return ['expanded', 'collapsed', 'hover'].includes(value);
  };

  const sidebarBehavior: 'expanded' | 'collapsed' | 'hover' = isValidBehavior(
    rawBehavior
  )
    ? rawBehavior
    : 'expanded';

  let defaultCollapsed;
  if (sidebarBehavior === 'collapsed') {
    defaultCollapsed = true;
  } else if (sidebarBehavior === 'hover') {
    defaultCollapsed = true;
  } else {
    defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : false;
  }

  if (!workspace) redirect('/onboarding');
  if (!workspace?.joined)
    return (
      <div className="flex h-screen w-screen items-center justify-center p-2 md:p-4">
        <InvitationCard workspace={workspace} />
      </div>
    );

  return (
    <SidebarProvider initialBehavior={sidebarBehavior}>
      <Structure
        wsId={wsId}
        user={user}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={navLinks}
        actions={
          <Suspense
            fallback={
              <div className="h-10 w-[88px] animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <NavbarActions />
          </Suspense>
        }
        userPopover={
          <Suspense
            fallback={
              <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <UserNav hideMetadata />
          </Suspense>
        }
      >
        {children}
      </Structure>
    </SidebarProvider>
  );
}
