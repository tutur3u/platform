import {
  Archive,
  Banknote,
  Bell,
  Blocks,
  Bolt,
  BookKey,
  BookText,
  BookUser,
  Bot,
  Box,
  Boxes,
  BriefcaseBusiness,
  Calendar,
  Cctv,
  ChartArea,
  ChartColumn,
  ChartColumnStacked,
  ChartGantt,
  CheckCircle2,
  CircleDollarSign,
  ClipboardClock,
  ClipboardList,
  Clock,
  ClockCheck,
  ClockFading,
  Database,
  FileText,
  FolderSync,
  GalleryVerticalEnd,
  Goal,
  GraduationCap,
  HandCoins,
  HardDrive,
  hexagons3,
  Icon,
  IdCardLanyard,
  KeyRound,
  Languages,
  LayoutDashboard,
  LayoutList,
  Link,
  ListCheck,
  ListTodo,
  Logs,
  Mail,
  Mails,
  MailX,
  Megaphone,
  MessageCircleIcon,
  NotepadText,
  Package,
  PencilRuler,
  Play,
  QrCodeIcon,
  Radio,
  ReceiptText,
  Repeat,
  RotateCcw,
  RulerDimensionLine,
  ScanSearch,
  ScreenShare,
  ScrollText,
  Send,
  Settings,
  ShieldAlert,
  ShieldBan,
  ShieldUser,
  Sparkle,
  Sparkles,
  SquareChevronRight,
  SquareKanban,
  SquaresIntersect,
  SquareUserRound,
  Star,
  SwatchBook,
  Tags,
  TextSelect,
  TicketPercent,
  Timer,
  Trash,
  TriangleAlert,
  Truck,
  UserCheck,
  UserLock,
  UserStar,
  Users,
  VectorSquare,
  Vote,
  Wallet,
  Warehouse,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  getSecret,
  getSecrets,
} from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import type { NavLink } from '@/components/navigation';
import { DEV_MODE } from '@/constants/common';
import { createTierRequirement } from '@/lib/feature-tiers';

export async function WorkspaceNavigationLinks({
  wsId,
  personalOrWsId,
  isPersonal,
}: {
  wsId: string;
  personalOrWsId: string;
  isPersonal: boolean;
  isTuturuuuUser: boolean;
}) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);
  const supabase = await createClient();

  // Parallelize all independent initial queries
  const [
    t,
    {
      data: { user },
    },
    secrets,
  ] = await Promise.all([
    getTranslations(),
    supabase.auth.getUser(),
    getSecrets({ wsId: resolvedWorkspaceId, forceAdmin: true }),
  ]);

  // Helper to check secrets from cached list
  const hasSecret = (name: string, value: string) =>
    getSecret(name, secrets)?.value === value;

  const ENABLE_AI_ONLY = hasSecret('ENABLE_AI_ONLY', 'true');

  // Parallelize user-dependent queries
  const [rootMemberData, workspacePermissions, platformUserRole] =
    await Promise.all([
      user
        ? supabase
            .from('workspace_members')
            .select('user_id')
            .eq('ws_id', ROOT_WORKSPACE_ID)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getPermissions({ wsId: resolvedWorkspaceId }),
      user
        ? supabase
            .from('platform_user_roles')
            .select('allow_discord_integrations')
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const { withoutPermission } = workspacePermissions;

  // Get root permissions only if user is a root member
  const withoutRootPermission = rootMemberData.data
    ? (await getPermissions({ wsId: ROOT_WORKSPACE_ID })).withoutPermission
    : () => true;

  const allowDiscordIntegrations =
    platformUserRole.data?.allow_discord_integrations ?? false;

  const navLinks: (NavLink | null)[] = [
    {
      title: t('common.dashboard'),
      href: `/${personalOrWsId}`,
      icon: <ChartArea className="h-5 w-5" />,
      matchExact: true,
    },
    {
      title: t('sidebar_tabs.notifications'),
      href: `/${personalOrWsId}/notifications`,
      aliases: [`/${personalOrWsId}/notifications`],
      icon: <Bell className="h-5 w-5" />,
    },
    null,
    {
      title: t('sidebar_tabs.tasks'),
      href: `/${personalOrWsId}/tasks`,
      aliases: [`/${personalOrWsId}/tasks`, `/${personalOrWsId}/tasks/habits`],
      icon: <CheckCircle2 className="h-5 w-5" />,
      disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
      experimental: 'beta',
      children: [
        {
          title: t('sidebar_tabs.tasks'),
          href: `/${personalOrWsId}/tasks`,
          icon: <UserStar className="h-4 w-4" />,
          matchExact: true,
        },
        {
          title: t('sidebar_tabs.habits'),
          href: `/${personalOrWsId}/tasks/habits`,
          icon: <Repeat className="h-4 w-4" />,
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.notes'),
          href: `/${personalOrWsId}/tasks/notes`,
          icon: <NotepadText className="h-4 w-4" />,
        },
        null,
        {
          title: t('sidebar_tabs.boards'),
          href: `/${personalOrWsId}/tasks/boards`,
          icon: <SquareKanban className="h-4 w-4" />,
        },
        null,
        {
          title: t('sidebar_tabs.initiatives'),
          href: `/${personalOrWsId}/tasks/initiatives`,
          icon: <Sparkle className="h-4 w-4" />,
          matchExact: true,
        },
        {
          title: t('sidebar_tabs.projects'),
          href: `/${personalOrWsId}/tasks/projects`,
          icon: <Box className="h-4 w-4" />,
        },
        null,
        // {
        //   title: t('sidebar_tabs.cycles'),
        //   href: `/${personalOrWsId}/tasks/cycles`,
        //   icon: <RotateCcw className="h-4 w-4" />,
        // },
        {
          title: t('sidebar_tabs.labels'),
          href: `/${personalOrWsId}/tasks/labels`,
          icon: <Tags className="h-4 w-4" />,
        },
        {
          title: t('sidebar_tabs.estimates'),
          icon: <Icon iconNode={hexagons3} className="h-4 w-4" />,
          href: `/${personalOrWsId}/tasks/estimates`,
        },
        null,
        {
          title: t('sidebar_tabs.logs'),
          href: `/${personalOrWsId}/tasks/logs`,
          icon: <Logs className="h-4 w-4" />,
          disabled: withoutPermission('manage_projects'),
        },
      ],
    },
    {
      title: t('sidebar_tabs.calendar'),
      icon: <Calendar className="h-5 w-5" />,
      href: `/${personalOrWsId}/calendar`,
      disabled: ENABLE_AI_ONLY || withoutPermission('manage_calendar'),
    },
    {
      title: t('sidebar_tabs.documents'),
      href: `/${personalOrWsId}/documents`,
      icon: <FileText className="h-5 w-5" />,
      disabled:
        ENABLE_AI_ONLY ||
        !hasSecret('ENABLE_DOCS', 'true') ||
        withoutPermission('manage_documents'),
      requiredWorkspaceTier: createTierRequirement('documents', {
        alwaysShow: true,
      }),
      experimental: 'beta',
    },
    {
      title: t('sidebar_tabs.whiteboards'),
      href: `/${personalOrWsId}/whiteboards`,
      icon: <PencilRuler className="h-5 w-5" />,
      requiredWorkspaceTier: createTierRequirement('whiteboards', {
        alwaysShow: true,
      }),
    },
    {
      title: t('sidebar_tabs.chat'),
      href: `/${personalOrWsId}/chat`,
      icon: <MessageCircleIcon className="h-5 w-5" />,
      requiredWorkspaceTier: createTierRequirement('chat', {
        alwaysShow: true,
      }),
      experimental: 'beta',
      requireRootMember: true,
      requireRootWorkspace: true,
    },
    {
      title: t('sidebar_tabs.track'),
      href: `/${personalOrWsId}/time-tracker`,
      requiredWorkspaceTier: createTierRequirement('time_tracker', {
        alwaysShow: true,
      }),
      children: [
        {
          title: t('sidebar_tabs.overview'),
          href: `/${personalOrWsId}/time-tracker`,
          icon: <LayoutDashboard className="h-5 w-5" />,
          matchExact: true,
        },
        {
          title: t('sidebar_tabs.timer'),
          href: `/${personalOrWsId}/time-tracker/timer`,
          icon: <Timer className="h-5 w-5" />,
        },
        {
          title: t('sidebar_tabs.history'),
          href: `/${personalOrWsId}/time-tracker/history`,
          icon: <ClipboardClock className="h-5 w-5" />,
        },
        {
          title: t('sidebar_tabs.categories'),
          href: `/${personalOrWsId}/time-tracker/categories`,
          icon: <Tags className="h-5 w-5" />,
        },
        {
          title: t('sidebar_tabs.goals'),
          href: `/${personalOrWsId}/time-tracker/goals`,
          icon: <Goal className="h-5 w-5" />,
        },
        null,
        {
          title: t('sidebar_tabs.time_tracker_management'),
          href: `/${personalOrWsId}/time-tracker/management`,
          icon: <ChartGantt className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.time_tracker_requests'),
          href: `/${personalOrWsId}/time-tracker/requests`,
          icon: <ClockCheck className="h-5 w-5" />,
          disabled: isPersonal,
        },
        null,
        {
          title: t('sidebar_tabs.settings'),
          href: `/${personalOrWsId}/time-tracker/settings`,
          icon: <Settings className="h-5 w-5" />,
        },
      ],
      icon: <ClockFading className="h-5 w-5" />,
      // disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
      experimental: 'beta',
      aliases: [
        `/${personalOrWsId}/time-tracker`,
        `/${personalOrWsId}/time-tracker/timer`,
        `/${personalOrWsId}/time-tracker/history`,
        `/${personalOrWsId}/time-tracker/categories`,
        `/${personalOrWsId}/time-tracker/goals`,
        `/${personalOrWsId}/time-tracker/management`,
        `/${personalOrWsId}/time-tracker/requests`,
        `/${personalOrWsId}/time-tracker/settings`,
      ],
    },
    {
      title: t('sidebar_tabs.workforce'),
      href: `/${personalOrWsId}/workforce`,
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      requiredWorkspaceTier: createTierRequirement('workforce', {
        alwaysShow: true,
      }),
      children: [
        {
          title: t('workspace-workforce-tabs.directory'),
          href: `/${personalOrWsId}/workforce`,
          icon: <Users className="h-5 w-5" />,
          matchExact: true,
          disabled:
            withoutPermission('view_workforce') &&
            withoutPermission('manage_workforce'),
        },
        {
          title: t('workspace-workforce-tabs.contracts'),
          href: `/${personalOrWsId}/workforce/contracts`,
          icon: <ScrollText className="h-5 w-5" />,
          disabled: withoutPermission('manage_workforce'),
        },
        null,
        {
          title: t('workspace-workforce-tabs.payroll'),
          href: `/${personalOrWsId}/workforce/payroll`,
          icon: <HandCoins className="h-5 w-5" />,
          disabled:
            withoutPermission('view_payroll') &&
            withoutPermission('manage_payroll'),
        },
      ],
      aliases: [
        `/${personalOrWsId}/workforce`,
        `/${personalOrWsId}/workforce/contracts`,
        `/${personalOrWsId}/workforce/payroll`,
      ],
      // disabled:
      //   ENABLE_AI_ONLY ||
      //   (withoutPermission('view_workforce') &&
      //     withoutPermission('manage_workforce')),
      tempDisabled: true, // coming soon
    },
    {
      title: t('sidebar_tabs.drive'),
      href: `/${personalOrWsId}/drive`,
      icon: <HardDrive className="h-5 w-5" />,
      requiredWorkspaceTier: createTierRequirement('drive', {
        alwaysShow: true,
      }),
      disabled: withoutPermission('manage_drive'),
      experimental: 'beta',
    },
    null,
    {
      title: t('sidebar_tabs.qr_generator'),
      href: `/${personalOrWsId}/qr-generator`,
      icon: <QrCodeIcon className="h-5 w-5" />,
    },
    null,
    {
      title: t('sidebar_tabs.finance'),
      aliases: [
        `/${personalOrWsId}/finance`,
        `/${personalOrWsId}/finance/transactions`,
        `/${personalOrWsId}/finance/recurring`,
        `/${personalOrWsId}/finance/wallets`,
        `/${personalOrWsId}/finance/budgets`,
        `/${personalOrWsId}/finance/analytics`,
        `/${personalOrWsId}/finance/transactions/categories`,
        `/${personalOrWsId}/finance/tags`,
        `/${personalOrWsId}/finance/invoices`,
        `/${personalOrWsId}/finance/settings`,
      ],
      icon: <Banknote className="h-5 w-5" />,
      requiredWorkspaceTier: createTierRequirement('finance', {
        alwaysShow: true,
      }),
      href: withoutPermission('manage_finance')
        ? undefined
        : `/${personalOrWsId}/finance`,
      children: [
        {
          title: t('workspace-finance-tabs.overview'),
          href: `/${personalOrWsId}/finance`,
          icon: <LayoutDashboard className="h-5 w-5" />,
          matchExact: true,
          disabled: withoutPermission('manage_finance'),
        },
        null,
        {
          title: t('workspace-finance-tabs.transactions'),
          href: `/${personalOrWsId}/finance/transactions`,
          matchExact: true,
          icon: <Banknote className="h-5 w-5" />,
          disabled: withoutPermission('view_transactions'),
        },
        {
          title: t('workspace-finance-tabs.wallets'),
          href: `/${personalOrWsId}/finance/wallets`,
          icon: <Wallet className="h-5 w-5" />,
          disabled: withoutPermission('manage_finance'),
        },
        {
          title: t('workspace-finance-tabs.invoices'),
          href: `/${personalOrWsId}/finance/invoices`,
          icon: <ReceiptText className="h-5 w-5" />,
          disabled: withoutPermission('manage_finance'),
        },
        null,
        {
          title: t('workspace-finance-tabs.recurring'),
          href: `/${personalOrWsId}/finance/recurring`,
          icon: <RotateCcw className="h-5 w-5" />,
          disabled: withoutPermission('manage_finance'),
        },
        {
          title: t('workspace-finance-tabs.budgets'),
          href: `/${personalOrWsId}/finance/budgets`,
          icon: <Goal className="h-5 w-5" />,
          disabled: withoutPermission('manage_finance'),
        },
        {
          title: t('workspace-finance-tabs.analytics'),
          href: `/${personalOrWsId}/finance/analytics`,
          icon: <ChartArea className="h-5 w-5" />,
          disabled: withoutPermission('manage_finance'),
        },
        null,
        {
          title: t('workspace-finance-tabs.categories'),
          href: `/${personalOrWsId}/finance/transactions/categories`,
          icon: <Tags className="h-5 w-5" />,
          disabled: withoutPermission('manage_finance'),
        },
        {
          title: t('workspace-finance-tabs.tags'),
          href: `/${personalOrWsId}/finance/tags`,
          icon: <Tags className="h-5 w-5" />,
          disabled: withoutPermission('manage_finance'),
        },
        null,
        {
          title: t('workspace-finance-tabs.settings'),
          href: `/${personalOrWsId}/finance/settings`,
          icon: <Settings className="h-5 w-5" />,
          disabled: true,
        },
      ],
      disabled: ENABLE_AI_ONLY || withoutPermission('manage_finance'),
    },
    {
      title: t('sidebar_tabs.users'),
      aliases: [
        `/${personalOrWsId}/users`,
        `/${personalOrWsId}/users/attendance`,
        `/${personalOrWsId}/users/database`,
        `/${personalOrWsId}/users/groups`,
        `/${personalOrWsId}/users/groups/indicators`,
        `/${personalOrWsId}/users/group-tags`,
        `/${personalOrWsId}/users/reports`,
        `/${personalOrWsId}/users/structure`,
      ],
      icon: <Users className="h-5 w-5" />,
      requiredWorkspaceTier: createTierRequirement('users', {
        alwaysShow: true,
      }),
      href: `/${personalOrWsId}/users/database`,
      children: [
        {
          title: t('workspace-users-tabs.overview'),
          href: `/${personalOrWsId}/users`,
          icon: <LayoutDashboard className="h-5 w-5" />,
          matchExact: true,
          disabled: withoutPermission('manage_users'),
        },
        null,
        {
          title: t('workspace-users-tabs.attendance'),
          href: `/${personalOrWsId}/users/attendance`,
          icon: <UserCheck className="h-5 w-5" />,
          disabled:
            withoutPermission('manage_users') &&
            withoutPermission('check_user_attendance'),
        },
        {
          title: t('workspace-users-tabs.database'),
          href: `/${personalOrWsId}/users/database`,
          icon: <BookUser className="h-5 w-5" />,
          disabled:
            withoutPermission('manage_users') &&
            withoutPermission('view_users_private_info') &&
            withoutPermission('view_users_public_info'),
        },
        {
          title: t('workspace-users-tabs.groups'),
          href: `/${personalOrWsId}/users/groups`,
          icon: <Users className="h-5 w-5" />,
          matchExact: true,
          disabled:
            withoutPermission('manage_users') &&
            withoutPermission('view_user_groups'),
        },
        {
          title: t('workspace-users-tabs.group_tags'),
          href: `/${personalOrWsId}/users/group-tags`,
          icon: <Tags className="h-5 w-5" />,
          disabled:
            withoutPermission('manage_users') &&
            withoutPermission('view_user_groups'),
        },
        null,
        {
          title: t('workspace-users-tabs.reports'),
          href: `/${personalOrWsId}/users/reports`,
          icon: <ClipboardList className="h-5 w-5" />,
          disabled: withoutPermission('manage_users'),
        },
        {
          title: t('workspace-users-tabs.metrics'),
          href: `/${personalOrWsId}/users/groups/indicators`,
          icon: <ChartColumn className="h-5 w-5" />,
          disabled: withoutPermission('view_user_groups_scores'),
        },
        {
          title: t('sidebar_tabs.posts'),
          href: `/${personalOrWsId}/posts`,
          icon: <GalleryVerticalEnd className="h-5 w-5" />,
          disabled:
            !hasSecret('ENABLE_EMAIL_SENDING', 'true') ||
            (!DEV_MODE &&
              (ENABLE_AI_ONLY ||
                withoutPermission('send_user_group_post_emails'))),
          experimental: 'beta',
        },
        null,
        {
          title: t('workspace-users-tabs.guest_leads'),
          href: `/${personalOrWsId}/users/guest-leads`,
          icon: <Mails className="h-5 w-5" />,
          disabled: withoutPermission('manage_users'),
        },
        null,
        {
          title: t('sidebar_tabs.structure'),
          aliases: [`/${personalOrWsId}/users/structure`],
          href: `/${personalOrWsId}/users/structure`,
          icon: <IdCardLanyard className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
          disabled:
            !DEV_MODE ||
            ENABLE_AI_ONLY ||
            !hasSecret('ENABLE_USERS', 'true') ||
            withoutPermission('manage_users'),
        },
      ],
      disabled:
        ENABLE_AI_ONLY ||
        !hasSecret('ENABLE_USERS', 'true') ||
        withoutPermission('manage_users'),
    },
    {
      title: t('sidebar_tabs.inventory'),
      icon: <Archive className="h-5 w-5" />,
      requiredWorkspaceTier: createTierRequirement('inventory', {
        alwaysShow: true,
      }),
      children: [
        {
          title: t('workspace-inventory-tabs.overview'),
          href: `/${personalOrWsId}/inventory`,
          icon: <LayoutDashboard className="h-5 w-5" />,
          matchExact: true,
          disabled: withoutPermission('view_inventory'),
        },
        null,
        {
          title: t('workspace-inventory-tabs.products'),
          href: `/${personalOrWsId}/inventory/products`,
          icon: <Package className="h-5 w-5" />,
          disabled: withoutPermission('view_inventory'),
        },
        {
          title: t('workspace-inventory-tabs.categories'),
          href: `/${personalOrWsId}/inventory/categories`,
          icon: <Tags className="h-5 w-5" />,
          disabled: withoutPermission('view_inventory'),
        },
        {
          title: t('workspace-inventory-tabs.units'),
          href: `/${personalOrWsId}/inventory/units`,
          icon: <RulerDimensionLine className="h-5 w-5" />,
          disabled: withoutPermission('view_inventory'),
        },
        {
          title: t('workspace-inventory-tabs.suppliers'),
          href: `/${personalOrWsId}/inventory/suppliers`,
          icon: <Truck className="h-5 w-5" />,
          disabled: withoutPermission('view_inventory'),
        },
        {
          title: t('workspace-inventory-tabs.warehouses'),
          href: `/${personalOrWsId}/inventory/warehouses`,
          icon: <Warehouse className="h-5 w-5" />,
          disabled: withoutPermission('view_inventory'),
        },
        {
          title: t('workspace-inventory-tabs.batches'),
          href: `/${personalOrWsId}/inventory/batches`,
          icon: <Boxes className="h-5 w-5" />,
          disabled: withoutPermission('view_inventory'),
        },
        null,
        {
          title: t('workspace-inventory-tabs.promotions'),
          href: `/${personalOrWsId}/inventory/promotions`,
          icon: <TicketPercent className="h-5 w-5" />,
          disabled: withoutPermission('view_inventory'),
        },
      ],
      disabled:
        ENABLE_AI_ONLY ||
        !hasSecret('ENABLE_INVENTORY', 'true') ||
        withoutPermission('view_inventory'),
    },
    null,
    {
      title: t('sidebar_tabs.more_tools'),
      icon: <SquareChevronRight className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.ai_lab'),
          icon: <Box className="h-5 w-5" />,
          requiredWorkspaceTier: createTierRequirement('ai_lab', {
            alwaysShow: true,
          }),
          children: [
            {
              title: t('sidebar_tabs.spark'),
              href: `/${personalOrWsId}/ai/spark`,
              icon: <Sparkles className="h-5 w-5" />,
              disabled:
                ENABLE_AI_ONLY ||
                !hasSecret('ENABLE_TASKS', 'true') ||
                withoutPermission('manage_projects'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.chat_with_ai'),
              href: `/${personalOrWsId}/ai-chat`,
              icon: <MessageCircleIcon className="h-5 w-5" />,
              disabled:
                ENABLE_AI_ONLY ||
                !hasSecret('ENABLE_CHAT', 'true') ||
                withoutPermission('ai_chat'),
              experimental: 'beta',
            },
            {
              title: t('sidebar_tabs.ai_executions'),
              href: `/${personalOrWsId}/ai/executions`,
              icon: <Cctv className="h-5 w-5" />,
              requireRootWorkspace: true,
              requireRootMember: true,
              disabled: withoutPermission('manage_workspace_roles'),
            },
            {
              title: t('sidebar_tabs.models'),
              href: `/${personalOrWsId}/models`,
              icon: <Box className="h-5 w-5" />,
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.datasets'),
              href: `/${personalOrWsId}/datasets`,
              icon: <Database className="h-5 w-5" />,
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'beta',
            },
            {
              title: t('sidebar_tabs.pipelines'),
              href: `/${personalOrWsId}/pipelines`,
              icon: <Play className="h-5 w-5" />,
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.crawlers'),
              href: `/${personalOrWsId}/crawlers`,
              icon: <ScanSearch className="h-5 w-5" />,
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.cron'),
              href: `/${personalOrWsId}/cron`,
              icon: <Clock className="h-5 w-5" />,
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.queues'),
              href: `/${personalOrWsId}/queues`,
              icon: <Logs className="h-5 w-5" />,
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
          ],
        },
        {
          title: t('sidebar_tabs.google_workspace'),
          icon: <ScreenShare className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
          children: [
            {
              title: t('sidebar_tabs.drive'),
              icon: <HardDrive className="h-5 w-5" />,
              href: 'https://drive.google.com/a/tuturuuu.com',
              external: true,
              newTab: true,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
            {
              title: t('sidebar_tabs.mail'),
              icon: <Mail className="h-5 w-5" />,
              href: 'https://mail.google.com/a/tuturuuu.com',
              external: true,
              newTab: true,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
            {
              title: t('sidebar_tabs.calendar'),
              icon: <Calendar className="h-5 w-5" />,
              href: 'https://www.google.com/calendar/hosted/tuturuuu.com',
              external: true,
              newTab: true,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
            // {
            //   title: t('sidebar_tabs.groups'),
            //   icon: <Users className="h-5 w-5" />,
            //   href: 'https://groups.google.com/a/tuturuuu.com',
            //   external: true,
            //   newTab: true,
            //   requireRootWorkspace: true,
            //   requireRootMember: true,
            // },
            // {
            //   title: t('sidebar_tabs.sites'),
            //   icon: <PanelsTopLeft className="h-5 w-5" />,
            //   href: 'https://sites.google.com/a/tuturuuu.com',
            //   external: true,
            //   newTab: true,
            //   requireRootWorkspace: true,
            //   requireRootMember: true,
            // },
          ],
        },
        {
          title: t('sidebar_tabs.productivity'),
          icon: <BriefcaseBusiness className="h-5 w-5" />,
          children: [
            {
              title: t('sidebar_tabs.tumeet'),
              href: `/${personalOrWsId}/tumeet`,
              icon: <SquaresIntersect className="h-5 w-5" />,
              children: [
                {
                  title: t('sidebar_tabs.plans'),
                  href: `/${personalOrWsId}/tumeet/plans`,
                  icon: <VectorSquare className="h-5 w-5" />,
                },
                {
                  title: t('sidebar_tabs.meetings'),
                  href: `/${personalOrWsId}/tumeet/meetings`,
                  icon: <SquareUserRound className="h-5 w-5" />,
                  requireRootWorkspace: true,
                  requireRootMember: true,
                },
              ],
            },
            {
              title: t('sidebar_tabs.polls'),
              href: `/${personalOrWsId}/polls`,
              icon: <Vote className="h-5 w-5" />,
              disabled: !DEV_MODE,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
            {
              title: t('sidebar_tabs.mail'),
              href: `/${personalOrWsId}/mail`,
              icon: <Mail className="h-5 w-5" />,
              children: [
                {
                  title: t('mail.inbox'),
                  icon: <Mail className="h-5 w-5" />,
                  disabled: !isPersonal,
                  tempDisabled: true,
                },
                {
                  title: t('mail.starred'),
                  icon: <Star className="h-5 w-5" />,
                  disabled: !isPersonal,
                  tempDisabled: true,
                },
                {
                  title: t('mail.sent'),
                  href: `/${personalOrWsId}/mail/sent`,
                  icon: <Send className="h-5 w-5" />,
                  disabled: !isPersonal,
                },
                {
                  title: t('mail.drafts'),
                  icon: <TextSelect className="h-5 w-5" />,
                  disabled: !isPersonal,
                  tempDisabled: true,
                },
                {
                  title: t('mail.spam'),
                  icon: <TriangleAlert className="h-5 w-5" />,
                  disabled: !isPersonal,
                  tempDisabled: true,
                },
                {
                  title: t('mail.trash'),
                  icon: <Trash className="h-5 w-5" />,
                  disabled: !isPersonal,
                  tempDisabled: true,
                },
              ],
              requireRootMember: true,
              disabled: !isPersonal,
              experimental: 'beta',
            },
            {
              title: t('sidebar_tabs.education'),
              href: `/${personalOrWsId}/education`,
              icon: <GraduationCap className="h-5 w-5" />,
              children: [
                {
                  title: t('workspace-education-tabs.overview'),
                  href: `/${personalOrWsId}/education`,
                  icon: <LayoutDashboard className="h-5 w-5" />,
                  matchExact: true,
                },
                {
                  title: t('workspace-education-tabs.courses'),
                  href: `/${personalOrWsId}/education/courses`,
                  icon: <BookText className="h-5 w-5" />,
                },
                {
                  title: t('workspace-education-tabs.flashcards'),
                  href: `/${personalOrWsId}/education/flashcards`,
                  icon: <SwatchBook className="h-5 w-5" />,
                },
                {
                  title: t('workspace-education-tabs.quiz-sets'),
                  href: `/${personalOrWsId}/education/quiz-sets`,
                  icon: <LayoutList className="h-5 w-5" />,
                },
                {
                  title: t('workspace-education-tabs.quizzes'),
                  href: `/${personalOrWsId}/education/quizzes`,
                  icon: <ListTodo className="h-5 w-5" />,
                },
                {
                  title: t('workspace-education-tabs.attempts'),
                  href: `/${personalOrWsId}/education/attempts`,
                  icon: <ListCheck className="h-5 w-5" />,
                },
              ],
              disabled:
                ENABLE_AI_ONLY ||
                !hasSecret('ENABLE_EDUCATION', 'true') ||
                withoutPermission('ai_lab'),
              experimental: 'beta',
            },
            {
              title: t('sidebar_tabs.link_shortener'),
              href: `/${personalOrWsId}/link-shortener`,
              icon: <Link className="h-5 w-5" />,
              disabled:
                resolvedWorkspaceId !== ROOT_WORKSPACE_ID &&
                !hasSecret('ENABLE_LINK_SHORTENER', 'true'),
            },
          ],
        },
      ],
    },
    {
      title: t('common.settings'),
      icon: <Settings className="h-5 w-5" />,
      aliases: [
        `/${personalOrWsId}/members`,
        `/${personalOrWsId}/teams`,
        `/${personalOrWsId}/roles`,
        `/${personalOrWsId}/settings/reports`,
        `/${personalOrWsId}/settings/notifications`,
        `/${personalOrWsId}/billing`,
        `/${personalOrWsId}/usage`,
        `/${personalOrWsId}/api-keys`,
        `/${personalOrWsId}/secrets`,
        `/${personalOrWsId}/migrations`,
        `/${personalOrWsId}/integrations`,
        `/${personalOrWsId}/integrations/discord`,
      ],
      children: [
        {
          title: t('workspace-settings-layout.workspace'),
          href: `/${personalOrWsId}/settings`,
          icon: <Bolt className="h-5 w-5" />,
          matchExact: true,
        },
        null,
        ...(!isPersonal
          ? [
              {
                title: t('workspace-settings-layout.members'),
                href: `/${personalOrWsId}/members`,
                icon: <Users className="h-5 w-5" />,
                disabled:
                  ENABLE_AI_ONLY ||
                  withoutPermission('manage_workspace_members'),
              },
              {
                title: t('workspace-settings-layout.workspace_roles'),
                href: `/${personalOrWsId}/roles`,
                icon: <UserLock className="h-5 w-5" />,
                disabled:
                  ENABLE_AI_ONLY || withoutPermission('manage_workspace_roles'),
              },
            ]
          : []),
        null,
        {
          title: t('workspace-settings-layout.reports'),
          href: `/${personalOrWsId}/settings/reports`,
          icon: <FileText className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_user_report_templates'),
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.notifications'),
          href: `/${personalOrWsId}/settings/notifications`,
          icon: <Bell className="h-5 w-5" />,
        },
        {
          title: t('sidebar_tabs.billing'),
          href: `/${personalOrWsId}/billing`,
          icon: <CircleDollarSign className="h-5 w-5" />,
          disabled: withoutPermission('manage_subscription'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.usage'),
          href: `/${personalOrWsId}/usage`,
          icon: <ChartColumnStacked className="h-5 w-5" />,
        },
        null,
        allowDiscordIntegrations
          ? {
              title: t('sidebar_tabs.integrations'),
              icon: <Bot className="h-5 w-5" />,
              href: `/${personalOrWsId}/integrations`,
              aliases: [`/${personalOrWsId}/integrations/discord`],
              children: [
                {
                  title: 'Discord',
                  href: `/${personalOrWsId}/integrations/discord`,
                  icon: <Bot className="h-5 w-5" />,
                  disabled: !allowDiscordIntegrations,
                },
              ],
              disabled: !allowDiscordIntegrations,
            }
          : null,
        {
          title: t('workspace-settings-layout.api_keys'),
          href: `/${personalOrWsId}/api-keys`,
          icon: <KeyRound className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY ||
            !hasSecret('ENABLE_API_KEYS', 'true') ||
            withoutPermission('manage_api_keys'),
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.secrets'),
          href: `/${personalOrWsId}/secrets`,
          icon: <BookKey className="h-5 w-5" />,
          disabled: withoutRootPermission('manage_workspace_secrets'),
          requireRootMember: true,
        },
        null,
        {
          title: t('workspace-settings-layout.infrastructure'),
          icon: <Blocks className="h-5 w-5" />,
          disabled: withoutPermission('view_infrastructure'),
          requireRootWorkspace: true,
          requireRootMember: true,
          children: [
            {
              title: t('infrastructure-tabs.overview'),
              href: `/${personalOrWsId}/infrastructure`,
              icon: <LayoutDashboard className="h-5 w-5" />,
              matchExact: true,
            },
            {
              title: t('infrastructure-tabs.users'),
              href: `/${personalOrWsId}/infrastructure/users`,
              icon: <Users className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.workspaces'),
              href: `/${personalOrWsId}/infrastructure/workspaces`,
              icon: <Blocks className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.email_blacklist'),
              href: `/${personalOrWsId}/infrastructure/email-blacklist`,
              icon: <MailX className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.email_audit'),
              href: `/${personalOrWsId}/infrastructure/email-audit`,
              icon: <Mails className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.email_templates'),
              href: `/${personalOrWsId}/infrastructure/email-templates`,
              icon: <Mail className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.blocked_ips'),
              href: `/${personalOrWsId}/infrastructure/blocked-ips`,
              icon: <ShieldBan className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.abuse_events'),
              href: `/${personalOrWsId}/infrastructure/abuse-events`,
              icon: <ShieldAlert className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.timezones'),
              href: `/${personalOrWsId}/infrastructure/timezones`,
              icon: <Clock className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.ai_whitelisted_emails'),
              href: `/${personalOrWsId}/infrastructure/ai/whitelist/emails`,
              icon: <Mail className="h-5 w-5" />,
            },
            {
              title: t('ws-ai-whitelist-domains.plural'),
              href: `/${personalOrWsId}/infrastructure/ai/whitelist/domains`,
              icon: <Database className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.translations'),
              href: `/${personalOrWsId}/infrastructure/translations`,
              icon: <Languages className="h-5 w-5" />,
            },
            {
              title: 'Calendar Sync',
              href: `/${personalOrWsId}/infrastructure/calendar-sync`,
              icon: <FolderSync className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.realtime'),
              href: `/${personalOrWsId}/infrastructure/realtime`,
              icon: <Radio className="h-5 w-5" />,
            },
            {
              title: t('infrastructure-tabs.changelog'),
              href: `/${personalOrWsId}/infrastructure/changelog`,
              icon: <Megaphone className="h-5 w-5" />,
              disabled: withoutPermission('manage_changelog'),
            },
          ],
        },
        {
          title: t('workspace-settings-layout.platform_roles'),
          href: `/${personalOrWsId}/platform/roles`,
          icon: <ShieldUser className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_workspace_roles'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.migrations'),
          href: `/${personalOrWsId}/migrations`,
          icon: <FolderSync className="h-5 w-5" />,
          disabled: withoutPermission('manage_external_migrations'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.inquiries'),
          href: `/${personalOrWsId}/inquiries`,
          icon: <MessageCircleIcon className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
        },
      ].filter(Boolean) as NavLink[],
    },
  ];

  /**
   * Remove consecutive nulls to avoid repeated separators in navigation.
   * Also removes leading and trailing nulls.
   * @param arr - Array of NavLinks and nulls (where null represents a separator)
   * @returns Cleaned array with no consecutive nulls and no leading/trailing nulls
   */
  const removeConsecutiveNulls = (
    arr: (NavLink | null)[]
  ): (NavLink | null)[] => {
    const withoutConsecutive = arr.reduce<(NavLink | null)[]>(
      (acc, item, index) => {
        // Skip null if previous item was also null
        if (item === null && index > 0 && arr[index - 1] === null) {
          return acc;
        }
        acc.push(item);
        return acc;
      },
      []
    );

    // Remove leading nulls
    while (withoutConsecutive.length > 0 && withoutConsecutive[0] === null) {
      withoutConsecutive.shift();
    }

    // Remove trailing nulls
    while (
      withoutConsecutive.length > 0 &&
      withoutConsecutive[withoutConsecutive.length - 1] === null
    ) {
      withoutConsecutive.pop();
    }

    return withoutConsecutive;
  };

  // Preserve null entries as separators; rendering components handle them
  return removeConsecutiveNulls(navLinks) satisfies (NavLink | null)[];
}
