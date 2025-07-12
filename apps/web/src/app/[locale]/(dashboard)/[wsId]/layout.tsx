import { createClient } from '@tuturuuu/supabase/next/server';
import {
  Archive,
  Banknote,
  Blocks,
  Bolt,
  BookKey,
  Box,
  BriefcaseBusiness,
  Calendar,
  ChartArea,
  CircleCheck,
  CircleDollarSign,
  Clock,
  ClockFading,
  Cog,
  Database,
  FileText,
  FolderSync,
  GraduationCap,
  HardDrive,
  KeyRound,
  Link,
  Logs,
  Mail,
  MessageCircleIcon,
  PencilLine,
  Play,
  Presentation,
  ScanSearch,
  ScrollText,
  ShieldUser,
  Sparkles,
  UserLock,
  Users,
} from '@tuturuuu/ui/icons';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  getPermissions,
  getWorkspace,
  verifySecret,
} from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import type { NavLink } from '@/components/navigation';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/common';
import { SidebarProvider } from '@/context/sidebar-context';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import InvitationCard from './invitation-card';
import { Structure } from './structure';

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
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
          shortcut: 'T',
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.mail'),
          href: `/${wsId}/mail`,
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
              name: 'ENABLE_WHITEBOARDS',
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
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
          shortcut: 'T',
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.link_shortener'),
          href: `/${wsId}/link-shortener`,
          icon: <Link className="h-5 w-5" />,
          disabled:
            wsId !== '00000000-0000-0000-0000-000000000000' &&
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_LINK_SHORTENER',
              value: 'true',
            })),
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
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_USERS',
              value: 'true',
            })) ||
            withoutPermission('manage_users'),
          shortcut: 'U',
        },
        {
          title: t('sidebar_tabs.finance'),
          aliases: [`/${wsId}/finance`],
          href: `/${wsId}/finance/transactions`,
          icon: <Banknote className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_FINANCE',
              value: 'true',
            })) ||
            withoutPermission('manage_finance'),
          shortcut: 'F',
        },
        {
          title: t('sidebar_tabs.inventory'),
          href: `/${wsId}/inventory`,
          icon: <Archive className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_INVENTORY',
              value: 'true',
            })) ||
            withoutPermission('manage_inventory'),
          shortcut: 'I',
        },
      ],
    },
    null,
    {
      title: t('common.settings'),
      icon: <Cog className="h-5 w-5" />,
      aliases: [
        `/${wsId}/members`,
        `/${wsId}/teams`,
        `/${wsId}/roles`,
        `/${wsId}/settings/reports`,
        `/${wsId}/billing`,
        `/${wsId}/api-keys`,
        `/${wsId}/secrets`,
        `/${wsId}/infrastructure`,
        `/${wsId}/migrations`,
        `/${wsId}/activities`,
      ],
      shortcut: ',',
      children: [
        {
          title: t('workspace-settings-layout.workspace'),
          href: `/${wsId}/settings`,
          icon: <Bolt className="h-5 w-5" />,
        },
        {
          title: t('workspace-settings-layout.members'),
          href: `/${wsId}/members`,
          icon: <Users className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_workspace_members'),
        },
        {
          title: t('workspace-settings-layout.workspace_roles'),
          href: `/${wsId}/roles`,
          icon: <UserLock className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_workspace_roles'),
        },
        {
          title: t('workspace-settings-layout.reports'),
          href: `/${wsId}/settings/reports`,
          icon: <FileText className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_user_report_templates'),
        },
        {
          title: t('sidebar_tabs.billing'),
          href: `/${wsId}/billing`,
          icon: <CircleDollarSign className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.api_keys'),
          href: `/${wsId}/api-keys`,
          icon: <KeyRound className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_workspace_security'),
        },
        {
          title: t('workspace-settings-layout.secrets'),
          href: `/${wsId}/secrets`,
          icon: <BookKey className="h-5 w-5" />,
          disabled: withoutPermission('manage_workspace_secrets'),
          requireRootMember: true,
        },

        {
          title: t('workspace-settings-layout.infrastructure'),
          href: `/${wsId}/infrastructure`,
          icon: <Blocks className="h-5 w-5" />,
          disabled: withoutPermission('view_infrastructure'),
          requireRootWorkspace: true,
        },
        {
          title: t('workspace-settings-layout.platform_roles'),
          href: `/${wsId}/platform/roles`,
          icon: <ShieldUser className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_workspace_roles'),
          requireRootWorkspace: true,
        },
        {
          title: t('workspace-settings-layout.migrations'),
          href: `/${wsId}/migrations`,
          icon: <FolderSync className="h-5 w-5" />,
          disabled: withoutPermission('manage_external_migrations'),
          requireRootWorkspace: true,
        },
        {
          title: t('workspace-settings-layout.activities'),
          href: `/${wsId}/activities`,
          icon: <ScrollText className="h-5 w-5" />,
          disabled: withoutPermission('manage_workspace_audit_logs'),
          requireRootWorkspace: true,
        },
      ],
    },
  ];

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  if (!user?.id) redirect('/login');

  const supabase = await createClient();
  const { data: platformUserRole } = await supabase
    .from('platform_user_roles')
    .select('*')
    .eq('user_id', user.id)
    .eq('allow_workspace_creation', true)
    .maybeSingle();

  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  const behaviorCookie = (await cookies()).get(SIDEBAR_BEHAVIOR_COOKIE_NAME);

  const rawBehavior = behaviorCookie?.value;
  const isValidBehavior = (
    value: string | undefined
  ): value is 'expanded' | 'collapsed' | 'hover' => {
    if (!value) return false;
    return ['expanded', 'collapsed', 'hover'].includes(value);
  };

  const sidebarBehavior: 'expanded' | 'collapsed' | 'hover' = isValidBehavior(
    rawBehavior
  )
    ? rawBehavior
    : 'expanded';

  let defaultCollapsed: boolean;
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
        disableCreateNewWorkspace={!platformUserRole?.allow_workspace_creation}
      >
        {children}
      </Structure>
    </SidebarProvider>
  );
}
