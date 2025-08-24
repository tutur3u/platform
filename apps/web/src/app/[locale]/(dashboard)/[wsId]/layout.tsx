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
  BookUser,
  Box,
  BriefcaseBusiness,
  Calendar,
  Cctv,
  ChartArea,
  ChartColumnStacked,
  CircleCheck,
  CircleDollarSign,
  ClipboardList,
  Clock,
  ClockFading,
  Cog,
  Database,
  FileText,
  FolderSync,
  GalleryVerticalEnd,
  GraduationCap,
  HardDrive,
  IdCardLanyard,
  KeyRound,
  LayoutDashboard,
  Link,
  Logs,
  Mail,
  MessageCircleIcon,
  PencilLine,
  Play,
  Presentation,
  QrCodeIcon,
  ReceiptText,
  ScanSearch,
  ScrollText,
  Send,
  ShieldUser,
  Sparkles,
  SquaresIntersect,
  SquareUserRound,
  Star,
  Tags,
  TextSelect,
  Trash,
  TriangleAlert,
  UserCheck,
  UserLock,
  Users,
  VectorSquare,
  Vote,
  Wallet,
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
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import InvitationCard from './invitation-card';
import PersonalWorkspacePrompt from './personal-workspace-prompt';
import { Structure } from './structure';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations();
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const correctedWSId = workspace.personal ? 'personal' : wsId;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  const ENABLE_AI_ONLY = await verifySecret({
    forceAdmin: true,
    wsId,
    name: 'ENABLE_AI_ONLY',
    value: 'true',
  });

  const user = await getCurrentUser();

  const navLinks: (NavLink | null)[] = [
    {
      title: t('common.dashboard'),
      href: `/${correctedWSId}`,
      icon: <ChartArea className="h-5 w-5" />,
      matchExact: true,
    },
    {
      title: t('sidebar_tabs.ai_lab'),
      icon: <Box className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.spark'),
          href: `/${correctedWSId}/ai/spark`,
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
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.chat_with_ai'),
          href: `/${correctedWSId}/chat`,
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
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.ai_executions'),
          href: `/${correctedWSId}/ai/executions`,
          icon: <Cctv className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
          disabled: withoutPermission('manage_workspace_roles'),
        },
        {
          title: t('sidebar_tabs.models'),
          href: `/${correctedWSId}/models`,
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
          href: `/${correctedWSId}/datasets`,
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
          href: `/${correctedWSId}/pipelines`,
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
          href: `/${correctedWSId}/crawlers`,
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
          href: `/${correctedWSId}/cron`,
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
          href: `/${correctedWSId}/queues`,
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
          icon: <Calendar className="h-5 w-5" />,
          href: `/${correctedWSId}/calendar`,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_calendar'),
          experimental: 'alpha',
          requireRootMember: true,
          children: user?.email?.endsWith('@tuturuuu.com')
            ? [
                {
                  title: t('calendar-tabs.calendar'),
                  href: `/${correctedWSId}/calendar`,
                  icon: <Calendar className="h-4 w-4" />,
                  requireRootMember: true,
                  matchExact: true,
                },
                {
                  title: t('calendar-tabs.sync-history'),
                  href: `/${correctedWSId}/calendar/history/sync`,
                  icon: <Activity className="h-4 w-4" />,
                  requireRootWorkspace: true,
                  requireRootMember: true,
                },
              ]
            : undefined,
        },
        {
          title: t('sidebar_tabs.tumeet'),
          href: `/${correctedWSId}/tumeet`,
          icon: <SquaresIntersect className="h-5 w-5" />,
          children: [
            {
              title: t('sidebar_tabs.plans'),
              href: `/${correctedWSId}/tumeet/plans`,
              icon: <VectorSquare className="h-5 w-5" />,
            },
            {
              title: t('sidebar_tabs.meetings'),
              href: `/${correctedWSId}/tumeet/meetings`,
              icon: <SquareUserRound className="h-5 w-5" />,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
          ],
        },
        {
          title: t('sidebar_tabs.polls'),
          href: `/${correctedWSId}/polls`,
          icon: <Vote className="h-5 w-5" />,
          disabled: !DEV_MODE,
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.tasks'),
          href: `/${correctedWSId}/tasks/boards`,
          icon: <CircleCheck className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.mail'),
          href: `/${correctedWSId}/mail`,
          icon: <Mail className="h-5 w-5" />,
          children: [
            {
              title: t('mail.inbox'),
              icon: <Mail className="h-5 w-5" />,
              disabled: !workspace.personal || id !== 'personal',
              tempDisabled: true,
            },
            {
              title: t('mail.starred'),
              icon: <Star className="h-5 w-5" />,
              disabled: !workspace.personal || id !== 'personal',
              tempDisabled: true,
            },
            {
              title: t('mail.sent'),
              href: `/${correctedWSId}/mail/sent`,
              icon: <Send className="h-5 w-5" />,
              disabled: !workspace.personal || id !== 'personal',
            },
            {
              title: t('mail.drafts'),
              icon: <TextSelect className="h-5 w-5" />,
              disabled: !workspace.personal || id !== 'personal',
              tempDisabled: true,
            },
            {
              title: t('mail.spam'),
              icon: <TriangleAlert className="h-5 w-5" />,
              disabled: !workspace.personal || id !== 'personal',
              tempDisabled: true,
            },
            {
              title: t('mail.trash'),
              icon: <Trash className="h-5 w-5" />,
              disabled: !workspace.personal || id !== 'personal',
              tempDisabled: true,
            },
          ],
          requireRootMember: true,
          disabled: !workspace.personal || id !== 'personal',
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.posts'),
          href: `/${correctedWSId}/posts`,
          icon: <GalleryVerticalEnd className="h-5 w-5" />,
          disabled:
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_EMAIL_SENDING',
              value: 'true',
            })) ||
            (!DEV_MODE &&
              (ENABLE_AI_ONLY ||
                withoutPermission('send_user_group_post_emails'))),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.drive'),
          href: `/${correctedWSId}/drive`,
          icon: <HardDrive className="h-5 w-5" />,
          disabled: withoutPermission('manage_drive'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.documents'),
          href: `/${correctedWSId}/documents`,
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
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.slides'),
          href: `/${correctedWSId}/slides`,
          icon: <Presentation className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_SLIDES',
              value: 'true',
            })),
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.education'),
          href: `/${correctedWSId}/education`,
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
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.whiteboards'),
          href: `/${correctedWSId}/whiteboards`,
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
          experimental: 'alpha',
        },
        {
          title: t('sidebar_tabs.time_tracker'),
          href: `/${correctedWSId}/time-tracker`,
          icon: <ClockFading className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.qr_generator'),
          href: `/${correctedWSId}/qr-generator`,
          icon: <QrCodeIcon className="h-5 w-5" />,
        },
        {
          title: t('sidebar_tabs.link_shortener'),
          href: `/${correctedWSId}/link-shortener`,
          icon: <Link className="h-5 w-5" />,
          disabled:
            wsId !== ROOT_WORKSPACE_ID &&
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
      title: t('sidebar_tabs.management'),
      icon: <Users className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.users'),
          aliases: [
            `/${correctedWSId}/users`,
            `/${correctedWSId}/users/attendance`,
            `/${correctedWSId}/users/database`,
            `/${correctedWSId}/users/groups`,
            `/${correctedWSId}/users/group-tags`,
            `/${correctedWSId}/users/reports`,
            `/${correctedWSId}/users/fields`,
            `/${correctedWSId}/users/structure`,
          ],
          icon: <Users className="h-5 w-5" />,
          children: [
            {
              title: t('workspace-users-tabs.overview'),
              href: `/${correctedWSId}/users`,
              icon: <LayoutDashboard className="h-5 w-5" />,
              matchExact: true,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.attendance'),
              href: `/${correctedWSId}/users/attendance`,
              icon: <UserCheck className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.database'),
              href: `/${correctedWSId}/users/database`,
              icon: <BookUser className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.groups'),
              href: `/${correctedWSId}/users/groups`,
              icon: <Users className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.group_tags'),
              href: `/${correctedWSId}/users/group-tags`,
              icon: <Tags className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.reports'),
              href: `/${correctedWSId}/users/reports`,
              icon: <ClipboardList className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.fields'),
              href: `/${correctedWSId}/users/fields`,
              icon: <PencilLine className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('sidebar_tabs.structure'),
              aliases: [`/${correctedWSId}/users/structure`],
              href: `/${correctedWSId}/users/structure`,
              icon: <IdCardLanyard className="h-5 w-5" />,
              requireRootWorkspace: true,
              requireRootMember: true,
              disabled:
                !DEV_MODE ||
                ENABLE_AI_ONLY ||
                !(await verifySecret({
                  forceAdmin: true,
                  wsId,
                  name: 'ENABLE_USERS',
                  value: 'true',
                })) ||
                withoutPermission('manage_users'),
            },
          ],
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_USERS',
              value: 'true',
            })) ||
            withoutPermission('manage_users'),
        },
        {
          title: t('sidebar_tabs.finance'),
          aliases: [
            `/${correctedWSId}/finance`,
            `/${correctedWSId}/finance/transactions`,
            `/${correctedWSId}/finance/wallets`,
            `/${correctedWSId}/finance/transactions/categories`,
            `/${correctedWSId}/finance/invoices`,
            `/${correctedWSId}/finance/settings`,
          ],
          icon: <Banknote className="h-5 w-5" />,
          children: [
            {
              title: t('workspace-finance-tabs.overview'),
              href: `/${correctedWSId}/finance`,
              icon: <LayoutDashboard className="h-5 w-5" />,
              matchExact: true,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.transactions'),
              href: `/${correctedWSId}/finance/transactions`,
              icon: <Banknote className="h-5 w-5" />,
              matchExact: true,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.wallets'),
              href: `/${correctedWSId}/finance/wallets`,
              icon: <Wallet className="h-5 w-5" />,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.categories'),
              href: `/${correctedWSId}/finance/transactions/categories`,
              icon: <Tags className="h-5 w-5" />,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.invoices'),
              href: `/${correctedWSId}/finance/invoices`,
              icon: <ReceiptText className="h-5 w-5" />,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.settings'),
              href: `/${correctedWSId}/finance/settings`,
              icon: <Cog className="h-5 w-5" />,
              disabled: true,
            },
          ],
          disabled:
            ENABLE_AI_ONLY ||
            !(await verifySecret({
              forceAdmin: true,
              wsId,
              name: 'ENABLE_FINANCE',
              value: 'true',
            })) ||
            withoutPermission('manage_finance'),
        },
        {
          title: t('sidebar_tabs.inventory'),
          href: `/${correctedWSId}/inventory`,
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
        },
      ],
    },
    {
      title: t('common.settings'),
      icon: <Cog className="h-5 w-5" />,
      aliases: [
        `/${correctedWSId}/members`,
        `/${correctedWSId}/teams`,
        `/${correctedWSId}/roles`,
        `/${correctedWSId}/settings/reports`,
        `/${correctedWSId}/billing`,
        `/${correctedWSId}/usage`,
        `/${correctedWSId}/api-keys`,
        `/${correctedWSId}/secrets`,
        `/${correctedWSId}/infrastructure`,
        `/${correctedWSId}/migrations`,
        `/${correctedWSId}/activities`,
      ],
      children: [
        {
          title: t('workspace-settings-layout.workspace'),
          href: `/${correctedWSId}/settings`,
          icon: <Bolt className="h-5 w-5" />,
          matchExact: true,
        },
        ...(wsId !== 'personal' && !workspace.personal
          ? [
              {
                title: t('workspace-settings-layout.members'),
                href: `/${correctedWSId}/members`,
                icon: <Users className="h-5 w-5" />,
                disabled:
                  ENABLE_AI_ONLY ||
                  withoutPermission('manage_workspace_members'),
              },
              {
                title: t('workspace-settings-layout.workspace_roles'),
                href: `/${correctedWSId}/roles`,
                icon: <UserLock className="h-5 w-5" />,
                disabled:
                  ENABLE_AI_ONLY || withoutPermission('manage_workspace_roles'),
              },
            ]
          : []),
        {
          title: t('workspace-settings-layout.reports'),
          href: `/${correctedWSId}/settings/reports`,
          icon: <FileText className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_user_report_templates'),
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.billing'),
          href: `/${correctedWSId}/billing`,
          icon: <CircleDollarSign className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.usage'),
          href: `/${correctedWSId}/usage`,
          icon: <ChartColumnStacked className="h-5 w-5" />,
        },
        {
          title: t('workspace-settings-layout.api_keys'),
          href: `/${correctedWSId}/api-keys`,
          icon: <KeyRound className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_workspace_security'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.secrets'),
          href: `/${correctedWSId}/secrets`,
          icon: <BookKey className="h-5 w-5" />,
          disabled: withoutPermission('manage_workspace_secrets'),
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.infrastructure'),
          href: `/${correctedWSId}/infrastructure`,
          icon: <Blocks className="h-5 w-5" />,
          disabled: withoutPermission('view_infrastructure'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.platform_roles'),
          href: `/${correctedWSId}/platform/roles`,
          icon: <ShieldUser className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_workspace_roles'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.migrations'),
          href: `/${correctedWSId}/migrations`,
          icon: <FolderSync className="h-5 w-5" />,
          disabled: withoutPermission('manage_external_migrations'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.activities'),
          href: `/${correctedWSId}/activities`,
          icon: <ScrollText className="h-5 w-5" />,
          disabled: withoutPermission('manage_workspace_audit_logs'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.inquiries'),
          href: `/${correctedWSId}/inquiries`,
          icon: <MessageCircleIcon className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
        },
      ].filter(Boolean) as NavLink[],
    },
  ] satisfies (NavLink | null)[];

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

  // Personal workspace prompt data
  const { data: existingPersonal } = await supabase
    .from('workspaces')
    .select('id')
    .eq('personal', true)
    .eq('creator_id', user.id)
    .maybeSingle();

  let eligibleWorkspaces: { id: string; name: string | null }[] | undefined;

  if (!existingPersonal) {
    const { data: candidates } = await supabase
      .from('workspaces')
      .select('id, name, creator_id, workspace_members(count)')
      .eq('creator_id', user.id);
    eligibleWorkspaces = (candidates || []).filter((ws) => {
      const memberCount = ws.workspace_members?.[0]?.count ?? 0;
      return memberCount === 1;
    });
  }

  const SHOW_PERSONAL_WORKSPACE_PROMPT =
    !existingPersonal &&
    (user.email?.endsWith('@tuturuuu.com') ||
      user.email?.endsWith('@xwf.tuturuuu.com'));

  if (SHOW_PERSONAL_WORKSPACE_PROMPT && eligibleWorkspaces?.length === 0)
    return (
      <PersonalWorkspacePrompt
        eligibleWorkspaces={eligibleWorkspaces || []}
        title={t('common.personal_account')}
        description={t('common.set_up_personal_workspace')}
        nameRule={t('common.personal_workspace_naming_rule')}
        createLabel={t('common.create_workspace')}
        markLabel={t('common.mark_as_personal')}
        selectPlaceholder={t('common.select_workspace')}
      />
    );

  return (
    <SidebarProvider initialBehavior={sidebarBehavior}>
      {SHOW_PERSONAL_WORKSPACE_PROMPT && (
        <div className="px-2 pt-2 md:px-4 md:pt-3">
          <PersonalWorkspacePrompt
            eligibleWorkspaces={eligibleWorkspaces || []}
            title={t('common.personal_account')}
            description={t('common.set_up_personal_workspace')}
            nameRule={t('common.personal_workspace_naming_rule')}
            createLabel={t('common.create_workspace')}
            markLabel={t('common.mark_as_personal')}
            selectPlaceholder={t('common.select_workspace')}
          />
        </div>
      )}
      <Structure
        wsId={wsId}
        user={user}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={navLinks.filter(Boolean) as NavLink[]}
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
