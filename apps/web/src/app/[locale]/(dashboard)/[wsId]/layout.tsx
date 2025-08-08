import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import InvitationCard from './invitation-card';
import { Structure } from './structure';
import type { NavLink } from '@/components/navigation';
import {
  DEV_MODE,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/common';
import { SidebarProvider } from '@/context/sidebar-context';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  Activity,
  Archive,
  Banknote,
  Blocks,
  Bolt,
  BookKey,
  Box,
  BriefcaseBusiness,
  Calendar,
  Cctv,
  ChartArea,
  CircleCheck,
  CircleDollarSign,
  Clock,
  ClockFading,
  Cog,
  Database,
  FileText,
  FolderSync,
  GalleryVerticalEnd,
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
  QrCodeIcon,
  ScanSearch,
  ScrollText,
  Send,
  ShieldUser,
  Sparkles,
  SquareUserRound,
  SquaresIntersect,
  Star,
  TextSelect,
  Trash,
  TriangleAlert,
  UserLock,
  Users,
  VectorSquare,
  Vote,
} from '@tuturuuu/ui/icons';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  getPermissions,
  getWorkspace,
  verifySecret,
} from '@tuturuuu/utils/workspace-helper';
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

  const workspace = await getWorkspace(wsId);

  const { withoutPermission } = await getPermissions({
    wsId: workspace.id,
  });

  const ENABLE_AI_ONLY = await verifySecret({
    forceAdmin: true,
    wsId: workspace.id,
    name: 'ENABLE_AI_ONLY',
    value: 'true',
  });

  const user = await getCurrentUser();

  const navLinks: (NavLink | null)[] = [
    {
      title: t('common.dashboard'),
      href: `/${wsId}`,
      icon: <ChartArea className="h-5 w-5" />,
      matchExact: true,
    },
    {
      title: t('sidebar_tabs.ai_lab'),
      icon: <Box className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.spark'),
          href: `/${wsId}/ai/spark`,
          icon: <Sparkles className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId: workspace.id,
              name: 'ENABLE_TASKS',
              value: 'true',
            })) ||
            withoutPermission('manage_projects'),
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.chat_with_ai'),
          href: `/${wsId}/chat`,
          icon: <MessageCircleIcon className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId: workspace.id,
              name: 'ENABLE_CHAT',
              value: 'true',
            })) ||
            withoutPermission('ai_chat'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.ai_executions'),
          href: `/${wsId}/ai/executions`,
          icon: <Cctv className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
          disabled: withoutPermission('manage_workspace_roles'),
        },
        {
          title: t('sidebar_tabs.models'),
          href: `/${wsId}/models`,
          icon: <Box className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId: workspace.id,
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
              wsId: workspace.id,
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
              wsId: workspace.id,
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
              wsId: workspace.id,
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
              wsId: workspace.id,
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
              wsId: workspace.id,
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
          icon: <Calendar className="h-5 w-5" />,
          href: `/${wsId}/calendar`,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_calendar'),
          experimental: 'alpha',
          children: user?.email?.endsWith('@tuturuuu.com')
            ? [
                {
                  title: t('calendar-tabs.calendar'),
                  href: `/${wsId}/calendar`,
                  icon: <Calendar className="h-4 w-4" />,
                  matchExact: true,
                },
                {
                  title: t('calendar-tabs.sync-history'),
                  href: `/${wsId}/calendar/history/sync`,
                  icon: <Activity className="h-4 w-4" />,
                  requireRootWorkspace: true,
                },
              ]
            : undefined,
        },
        {
          title: t('sidebar_tabs.tumeet'),
          href: `/${wsId}/tumeet`,
          icon: <SquaresIntersect className="h-5 w-5" />,
          children: [
            {
              title: t('sidebar_tabs.plans'),
              href: `/${wsId}/tumeet/plans`,
              icon: <VectorSquare className="h-5 w-5" />,
            },
            {
              title: t('sidebar_tabs.meetings'),
              href: `/${wsId}/tumeet/meetings`,
              icon: <SquareUserRound className="h-5 w-5" />,
            },
          ],
        },
        {
          title: t('sidebar_tabs.polls'),
          href: `/${wsId}/polls`,
          icon: <Vote className="h-5 w-5" />,
          disabled: !DEV_MODE,
        },
        {
          title: t('sidebar_tabs.tasks'),
          href: `/${wsId}/tasks/boards`,
          icon: <CircleCheck className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.mail'),
          href: `/${wsId}/mail`,
          icon: <Mail className="h-5 w-5" />,
          children: [
            {
              title: t('mail.inbox'),
              icon: <Mail className="h-5 w-5" />,
              tempDisabled: true,
            },
            {
              title: t('mail.starred'),
              icon: <Star className="h-5 w-5" />,
              tempDisabled: true,
            },
            {
              title: t('mail.sent'),
              href: `/${wsId}/mail/sent`,
              icon: <Send className="h-5 w-5" />,
            },
            {
              title: t('mail.drafts'),
              icon: <TextSelect className="h-5 w-5" />,
              tempDisabled: true,
            },
            {
              title: t('mail.spam'),
              icon: <TriangleAlert className="h-5 w-5" />,
              tempDisabled: true,
            },
            {
              title: t('mail.trash'),
              icon: <Trash className="h-5 w-5" />,
              tempDisabled: true,
            },
          ],
          disabled:
            !DEV_MODE &&
            (ENABLE_AI_ONLY ||
              !(await verifySecret({
                forceAdmin: true,
                wsId: workspace.id,
                name: 'ENABLE_EMAIL_SENDING',
                value: 'true',
              })) ||
              withoutPermission('send_user_group_post_emails')),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.posts'),
          href: `/${wsId}/posts`,
          icon: <GalleryVerticalEnd className="h-5 w-5" />,
          disabled:
            !DEV_MODE &&
            (ENABLE_AI_ONLY ||
              !(await verifySecret({
                forceAdmin: true,
                wsId: workspace.id,
                name: 'ENABLE_EMAIL_SENDING',
                value: 'true',
              })) ||
              withoutPermission('send_user_group_post_emails')),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.drive'),
          href: `/${wsId}/drive`,
          icon: <HardDrive className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId: workspace.id,
              name: 'ENABLE_DRIVE',
              value: 'true',
            })) || withoutPermission('manage_drive'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.documents'),
          href: `/${wsId}/documents`,
          icon: <FileText className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId: workspace.id,
              name: 'ENABLE_DOCS',
              value: 'true',
            })) ||
            withoutPermission('manage_documents'),
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
              wsId: workspace.id,
              name: 'ENABLE_SLIDES',
              value: 'true',
            })),
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
              wsId: workspace.id,
              name: 'ENABLE_EDUCATION',
              value: 'true',
            })) ||
            withoutPermission('ai_lab'),
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
              wsId: workspace.id,
              name: 'ENABLE_WHITEBOARDS',
              value: 'true',
            })) ||
            withoutPermission('manage_projects'),
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.time_tracker'),
          href: `/${wsId}/time-tracker`,
          icon: <ClockFading className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.qr_generator'),
          href: `/${wsId}/qr-generator`,
          icon: <QrCodeIcon className="h-5 w-5" />,
        },
        {
          title: t('sidebar_tabs.link_shortener'),
          href: `/${wsId}/link-shortener`,
          icon: <Link className="h-5 w-5" />,
          disabled:
            wsId !== ROOT_WORKSPACE_ID &&
            !(await verifySecret({
              forceAdmin: true,
              wsId: workspace.id,
              name: 'ENABLE_LINK_SHORTENER',
              value: 'true',
            })),
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
              wsId: workspace.id,
              name: 'ENABLE_USERS',
              value: 'true',
            })) ||
            withoutPermission('manage_users'),
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
              wsId: workspace.id,
              name: 'ENABLE_FINANCE',
              value: 'true',
            })) ||
            withoutPermission('manage_finance'),
        },
        {
          title: t('sidebar_tabs.inventory'),
          href: `/${wsId}/inventory`,
          icon: <Archive className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId: workspace.id,
              name: 'ENABLE_INVENTORY',
              value: 'true',
            })) ||
            withoutPermission('manage_inventory'),
        },
      ],
    },
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
            key={user.id}
            fallback={
              <div className="h-10 w-[88px] animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <NavbarActions />
          </Suspense>
        }
        userPopover={
          <Suspense
            key={user.id}
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
