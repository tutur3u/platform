import type { NavLink } from '@/components/navigation';
import { DEV_MODE } from '@/constants/common';
import {
  Activity,
  Archive,
  Banknote,
  Blocks,
  Bolt,
  BookKey,
  BookText,
  BookUser,
  Box,
  Boxes,
  BriefcaseBusiness,
  Calendar,
  Cctv,
  ChartArea,
  ChartColumnStacked,
  ChartGantt,
  CircleCheck,
  CircleDollarSign,
  ClipboardClock,
  ClipboardList,
  Clock,
  ClockFading,
  Database,
  FileText,
  FolderSync,
  GalleryVerticalEnd,
  Goal,
  GraduationCap,
  HardDrive,
  IdCardLanyard,
  KeyRound,
  LayoutDashboard,
  LayoutList,
  Link,
  ListCheck,
  ListTodo,
  Logs,
  Mail,
  MessageCircleIcon,
  Package,
  PencilLine,
  Play,
  Presentation,
  QrCodeIcon,
  ReceiptText,
  RulerDimensionLine,
  ScanSearch,
  Send,
  Settings,
  ShieldUser,
  Sparkles,
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
  Users,
  VectorSquare,
  Vote,
  Wallet,
  Warehouse,
} from '@tuturuuu/ui/icons';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions, verifySecret } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export async function WorkspaceNavigationLinks({
  wsId,
  personalOrWsId,
  isPersonal,
  isTuturuuuUser,
}: {
  wsId: string;
  personalOrWsId: string;
  isPersonal: boolean;
  isTuturuuuUser: boolean;
}) {
  const t = await getTranslations();
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
      href: `/${personalOrWsId}`,
      icon: <ChartArea className="h-5 w-5" />,
      matchExact: true,
    },
    {
      title: t('sidebar_tabs.ai_lab'),
      icon: <Box className="h-5 w-5" />,
      children: [
        {
          title: t('sidebar_tabs.spark'),
          href: `/${personalOrWsId}/ai/spark`,
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
          href: `/${personalOrWsId}/chat`,
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
          href: `/${personalOrWsId}/datasets`,
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
          href: `/${personalOrWsId}/pipelines`,
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
          href: `/${personalOrWsId}/crawlers`,
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
          href: `/${personalOrWsId}/cron`,
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
          href: `/${personalOrWsId}/queues`,
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
          href: `/${personalOrWsId}/calendar`,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_calendar'),
          experimental: 'alpha',
          requireRootMember: true,
          children: isTuturuuuUser
            ? [
                {
                  title: t('calendar-tabs.calendar'),
                  href: `/${personalOrWsId}/calendar`,
                  icon: <Calendar className="h-4 w-4" />,
                  requireRootMember: true,
                  matchExact: true,
                },
                {
                  title: t('calendar-tabs.sync-history'),
                  href: `/${personalOrWsId}/calendar/history/sync`,
                  icon: <Activity className="h-4 w-4" />,
                  requireRootWorkspace: true,
                  requireRootMember: true,
                },
              ]
            : undefined,
        },
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
          title: t('sidebar_tabs.tasks'),
          href: `/${personalOrWsId}/tasks/boards`,
          icon: <CircleCheck className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
          experimental: 'beta',
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
          title: t('sidebar_tabs.posts'),
          href: `/${personalOrWsId}/posts`,
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
          href: `/${personalOrWsId}/drive`,
          icon: <HardDrive className="h-5 w-5" />,
          disabled: withoutPermission('manage_drive'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.documents'),
          href: `/${personalOrWsId}/documents`,
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
          href: `/${personalOrWsId}/slides`,
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
          href: `/${personalOrWsId}/education`,
          icon: <GraduationCap className="h-5 w-5" />,
          children: [
            {
              title: t('workspace-education-tabs.overview'),
              href: `/${wsId}/education`,
              icon: <LayoutDashboard className="h-5 w-5" />,
              matchExact: true,
            },
            {
              title: t('workspace-education-tabs.courses'),
              href: `/${wsId}/education/courses`,
              icon: <BookText className="h-5 w-5" />,
            },
            {
              title: t('workspace-education-tabs.flashcards'),
              href: `/${wsId}/education/flashcards`,
              icon: <SwatchBook className="h-5 w-5" />,
            },
            {
              title: t('workspace-education-tabs.quiz-sets'),
              href: `/${wsId}/education/quiz-sets`,
              icon: <LayoutList className="h-5 w-5" />,
            },
            {
              title: t('workspace-education-tabs.quizzes'),
              href: `/${wsId}/education/quizzes`,
              icon: <ListTodo className="h-5 w-5" />,
            },
            {
              title: t('workspace-education-tabs.attempts'),
              href: `/${wsId}/education/attempts`,
              icon: <ListCheck className="h-5 w-5" />,
            },
          ],
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
          href: `/${personalOrWsId}/whiteboards`,
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
          href: `/${personalOrWsId}/time-tracker`,
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
            {
              title: t('sidebar_tabs.time_tracker_management'),
              href: `/${personalOrWsId}/time-tracker/management`,
              icon: <ChartGantt className="h-5 w-5" />,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
            {
              title: t('sidebar_tabs.settings'),
              href: `/${personalOrWsId}/time-tracker/settings`,
              icon: <Settings className="h-5 w-5" />,
            },
          ],
          icon: <ClockFading className="h-5 w-5" />,
          disabled: ENABLE_AI_ONLY || withoutPermission('manage_projects'),
          experimental: 'beta',
        },
        {
          title: t('sidebar_tabs.qr_generator'),
          href: `/${personalOrWsId}/qr-generator`,
          icon: <QrCodeIcon className="h-5 w-5" />,
        },
        {
          title: t('sidebar_tabs.link_shortener'),
          href: `/${personalOrWsId}/link-shortener`,
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
            `/${personalOrWsId}/users`,
            `/${personalOrWsId}/users/attendance`,
            `/${personalOrWsId}/users/database`,
            `/${personalOrWsId}/users/groups`,
            `/${personalOrWsId}/users/group-tags`,
            `/${personalOrWsId}/users/reports`,
            `/${personalOrWsId}/users/structure`,
          ],
          icon: <Users className="h-5 w-5" />,
          children: [
            {
              title: t('workspace-users-tabs.overview'),
              href: `/${personalOrWsId}/users`,
              icon: <LayoutDashboard className="h-5 w-5" />,
              matchExact: true,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.attendance'),
              href: `/${personalOrWsId}/users/attendance`,
              icon: <UserCheck className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.database'),
              href: `/${personalOrWsId}/users/database`,
              icon: <BookUser className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.groups'),
              href: `/${personalOrWsId}/users/groups`,
              icon: <Users className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.group_tags'),
              href: `/${personalOrWsId}/users/group-tags`,
              icon: <Tags className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
            {
              title: t('workspace-users-tabs.reports'),
              href: `/${personalOrWsId}/users/reports`,
              icon: <ClipboardList className="h-5 w-5" />,
              disabled: withoutPermission('manage_users'),
            },
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
            `/${personalOrWsId}/finance`,
            `/${personalOrWsId}/finance/transactions`,
            `/${personalOrWsId}/finance/wallets`,
            `/${personalOrWsId}/finance/transactions/categories`,
            `/${personalOrWsId}/finance/invoices`,
            `/${personalOrWsId}/finance/settings`,
          ],
          icon: <Banknote className="h-5 w-5" />,
          children: [
            {
              title: t('workspace-finance-tabs.overview'),
              href: `/${personalOrWsId}/finance`,
              icon: <LayoutDashboard className="h-5 w-5" />,
              matchExact: true,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.transactions'),
              href: `/${personalOrWsId}/finance/transactions`,
              matchExact: true,
              icon: <Banknote className="h-5 w-5" />,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.wallets'),
              href: `/${personalOrWsId}/finance/wallets`,
              icon: <Wallet className="h-5 w-5" />,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.categories'),
              href: `/${personalOrWsId}/finance/transactions/categories`,
              icon: <Tags className="h-5 w-5" />,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.invoices'),
              href: `/${personalOrWsId}/finance/invoices`,
              icon: <ReceiptText className="h-5 w-5" />,
              disabled: withoutPermission('manage_finance'),
            },
            {
              title: t('workspace-finance-tabs.settings'),
              href: `/${personalOrWsId}/finance/settings`,
              icon: <Settings className="h-5 w-5" />,
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
          icon: <Archive className="h-5 w-5" />,
          children: [
            {
              title: t('workspace-inventory-tabs.overview'),
              href: `/${personalOrWsId}/inventory`,
              icon: <LayoutDashboard className="h-5 w-5" />,
              matchExact: true,
              disabled: withoutPermission('manage_inventory'),
            },
            {
              title: t('workspace-inventory-tabs.products'),
              href: `/${personalOrWsId}/inventory/products`,
              icon: <Package className="h-5 w-5" />,
              disabled: withoutPermission('manage_inventory'),
            },
            {
              title: t('workspace-inventory-tabs.categories'),
              href: `/${personalOrWsId}/inventory/categories`,
              icon: <Tags className="h-5 w-5" />,
              disabled: withoutPermission('manage_inventory'),
            },
            {
              title: t('workspace-inventory-tabs.units'),
              href: `/${personalOrWsId}/inventory/units`,
              icon: <RulerDimensionLine className="h-5 w-5" />,
              disabled: withoutPermission('manage_inventory'),
            },
            {
              title: t('workspace-inventory-tabs.suppliers'),
              href: `/${personalOrWsId}/inventory/suppliers`,
              icon: <Truck className="h-5 w-5" />,
              disabled: withoutPermission('manage_inventory'),
            },
            {
              title: t('workspace-inventory-tabs.warehouses'),
              href: `/${personalOrWsId}/inventory/warehouses`,
              icon: <Warehouse className="h-5 w-5" />,
              disabled: withoutPermission('manage_inventory'),
            },
            {
              title: t('workspace-inventory-tabs.batches'),
              href: `/${personalOrWsId}/inventory/batches`,
              icon: <Boxes className="h-5 w-5" />,
              disabled: withoutPermission('manage_inventory'),
            },
            {
              title: t('workspace-inventory-tabs.promotions'),
              href: `/${personalOrWsId}/inventory/promotions`,
              icon: <TicketPercent className="h-5 w-5" />,
              disabled: withoutPermission('manage_inventory'),
            },
          ],
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
      icon: <Settings className="h-5 w-5" />,
      aliases: [
        `/${personalOrWsId}/members`,
        `/${personalOrWsId}/teams`,
        `/${personalOrWsId}/roles`,
        `/${personalOrWsId}/settings/reports`,
        `/${personalOrWsId}/billing`,
        `/${personalOrWsId}/usage`,
        `/${personalOrWsId}/api-keys`,
        `/${personalOrWsId}/secrets`,
        `/${personalOrWsId}/infrastructure`,
        `/${personalOrWsId}/migrations`,
      ],
      children: [
        {
          title: t('workspace-settings-layout.workspace'),
          href: `/${personalOrWsId}/settings`,
          icon: <Bolt className="h-5 w-5" />,
          matchExact: true,
        },
        ...(wsId !== 'personal' && !isPersonal
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
        {
          title: t('workspace-settings-layout.reports'),
          href: `/${personalOrWsId}/settings/reports`,
          icon: <FileText className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_user_report_templates'),
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.billing'),
          href: `/${personalOrWsId}/billing`,
          icon: <CircleDollarSign className="h-5 w-5" />,
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('sidebar_tabs.usage'),
          href: `/${personalOrWsId}/usage`,
          icon: <ChartColumnStacked className="h-5 w-5" />,
        },
        {
          title: t('workspace-settings-layout.api_keys'),
          href: `/${personalOrWsId}/api-keys`,
          icon: <KeyRound className="h-5 w-5" />,
          disabled:
            ENABLE_AI_ONLY || withoutPermission('manage_workspace_security'),
          requireRootWorkspace: true,
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.secrets'),
          href: `/${personalOrWsId}/secrets`,
          icon: <BookKey className="h-5 w-5" />,
          disabled: withoutPermission('manage_workspace_secrets'),
          requireRootMember: true,
        },
        {
          title: t('workspace-settings-layout.infrastructure'),
          href: `/${personalOrWsId}/infrastructure`,
          icon: <Blocks className="h-5 w-5" />,
          disabled: withoutPermission('view_infrastructure'),
          requireRootWorkspace: true,
          requireRootMember: true,
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

  return (navLinks satisfies (NavLink | null)[]).filter(Boolean) as NavLink[];
}
