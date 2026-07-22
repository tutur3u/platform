import {
  TASK_NAVIGATION_GOALS_CONFIG_ID,
  TASK_NAVIGATION_IMPORT_CONFIG_ID,
  TASK_NAVIGATION_LEADERBOARDS_CONFIG_ID,
  TASK_NAVIGATION_PROGRESS_CONFIG_ID,
  TASK_NAVIGATION_STATS_CONFIG_ID,
  TASK_SECONDARY_NAVIGATION_CONFIG_IDS,
} from '@tuturuuu/internal-api/users';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { notFound } from 'next/navigation';
import { DEV_MODE } from '@/constants/env';
import { getCalendarAppOrigin } from '@/lib/calendar-app-url';
import { getChatAppOrigin } from '@/lib/chat-app-url';
import { getContactsAppOrigin } from '@/lib/contacts-app-url';
import { getDriveAppOrigin } from '@/lib/drive-app-url';
import { createTierRequirement } from '@/lib/feature-tiers';
import { getFinanceAppOrigin } from '@/lib/finance-app-url';
import { getFormsAppOrigin } from '@/lib/forms-app-url';
import { HABITS_ENABLED_SECRET } from '@/lib/habits/constants';
import { getHiveAppOrigin } from '@/lib/hive-app-url';
import { getInventoryAppOrigin } from '@/lib/inventory-app-url';
import { getMailAppOrigin } from '@/lib/mail-app-url';
import { getMeetAppOrigin } from '@/lib/meet-app-url';
import { getMindAppOrigin } from '@/lib/mind-app-url';
import { getQrAppBaseUrl } from '@/lib/qr-app-url';
import { getTasksAppOrigin } from '@/lib/tasks-app-url';
import { getTrackAppOrigin } from '@/lib/track-app-url';
import {
  createDashboardNavigationIcon,
  type DashboardNavigationLink,
} from './navigation-icon-descriptor';
import { createWorkspaceMembersNavigationLink } from './workspace-members-navigation';

type NavigationUser = {
  email?: string;
  id: string;
};

async function createNavigationSupabaseClient() {
  const { createClient } = await import('@tuturuuu/supabase/next/server');

  return createClient();
}

async function createNavigationAdminClient(options?: { noCookie?: boolean }) {
  const { createAdminClient } = await import('@tuturuuu/supabase/next/server');

  return createAdminClient(options);
}

async function loadWorkspaceNavigationHelpers() {
  const workspaceHelperModule = await import(
    '@tuturuuu/utils/workspace-helper'
  );
  const { getPermissions, getSecret, getSecrets } = workspaceHelperModule;

  return {
    getPermissions,
    getSecret,
    getSecrets,
  };
}

export async function WorkspaceNavigationLinks({
  wsId,
  personalOrWsId,
  isPersonal,
  user: providedUser,
}: {
  wsId: string;
  personalOrWsId: string;
  isPersonal: boolean;
  isTuturuuuUser: boolean;
  user?: NavigationUser | null;
}) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);
  const [supabase, { getTranslations }, workspaceNavigationHelpers] =
    await Promise.all([
      createNavigationSupabaseClient(),
      import('next-intl/server'),
      loadWorkspaceNavigationHelpers(),
    ]);
  const { getPermissions, getSecret, getSecrets } = workspaceNavigationHelpers;

  // Parallelize all independent initial queries
  const [t, user, secrets] = await Promise.all([
    getTranslations(),
    providedUser
      ? Promise.resolve(providedUser)
      : import('@tuturuuu/supabase/next/auth-session-user').then(
          async ({ resolveAuthenticatedSessionUser }) =>
            (await resolveAuthenticatedSessionUser(supabase)).user
        ),
    getSecrets({ wsId: resolvedWorkspaceId, forceAdmin: true }),
  ]);
  if (!secrets) notFound();

  // Helper to check secrets from cached list
  const hasSecret = (name: string, value: string) =>
    getSecret(name, secrets)?.value === value;

  const ENABLE_AI_ONLY = hasSecret('ENABLE_AI_ONLY', 'true');
  const ENABLE_HABITS = hasSecret(HABITS_ENABLED_SECRET, 'true');
  const qrAppHref = getQrAppBaseUrl().toString();
  const isMailUser = isExactTuturuuuDotComEmail(user?.email);
  const mailAppHref = `${getMailAppOrigin()}/${personalOrWsId}`;
  const inventoryAppHref = `${getInventoryAppOrigin()}/${personalOrWsId}`;
  const calendarAppHref = `${getCalendarAppOrigin()}/${personalOrWsId}`;
  const chatAppHref = `${getChatAppOrigin()}/${personalOrWsId}`;
  const contactsAppHref = `${getContactsAppOrigin()}/${personalOrWsId}`;
  const driveAppHref = `${getDriveAppOrigin()}/${personalOrWsId}`;
  const financeAppHref = `${getFinanceAppOrigin()}/${personalOrWsId}`;
  const formsAppHref = `${getFormsAppOrigin()}/${personalOrWsId}/forms`;
  const meetAppHref = `${getMeetAppOrigin()}/workspace/${personalOrWsId}`;
  const mindAppHref = `${getMindAppOrigin()}/${personalOrWsId}`;
  const hiveAppHref = getHiveAppOrigin();
  const tasksAppHref = `${getTasksAppOrigin()}/${personalOrWsId}`;
  const trackAppHref = `${getTrackAppOrigin()}/${personalOrWsId}`;

  // Parallelize user-dependent queries
  const [
    workspacePermissions,
    userInvoiceVisibilityConfig,
    userTaskNavigationConfigs,
    workspaceInvoiceVisibilityConfig,
  ] = await Promise.all([
    getPermissions({ user, wsId: resolvedWorkspaceId }),
    // Get user's invoice visibility preference
    user
      ? supabase
          .from('user_configs')
          .select('value')
          .eq('user_id', user.id)
          .eq('id', 'FINANCE_SHOW_INVOICES')
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from('user_configs')
          .select('id,value')
          .eq('user_id', user.id)
          .in('id', [...TASK_SECONDARY_NAVIGATION_CONFIG_IDS])
      : Promise.resolve({ data: [] }),
    // Get workspace's invoice visibility setting
    supabase
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', resolvedWorkspaceId)
      .eq('id', 'finance_show_invoices')
      .maybeSingle(),
  ]);
  if (!workspacePermissions) {
    if (!user) notFound();

    const sbAdmin = await createNavigationAdminClient({ noCookie: true });
    const {
      loadTaskBoardGuestSharesForWorkspace,
      summarizeTaskBoardGuestShares,
    } = await import('@tuturuuu/tasks-api/server/board-access');
    const guestShares = await loadTaskBoardGuestSharesForWorkspace({
      sbAdmin,
      user,
      workspaceId: resolvedWorkspaceId,
    });
    const guestSummary = summarizeTaskBoardGuestShares(guestShares);

    if (guestSummary.boardCount === 0) notFound();

    const sidebarSections = {
      core: t('sidebar_sections.core'),
    };

    return [
      {
        id: 'tasks',
        title: t('sidebar_tabs.tasks'),
        href: `${tasksAppHref}/tasks`,
        aliases: [
          `/${personalOrWsId}/tasks`,
          `/${personalOrWsId}/tasks/boards`,
          `/${personalOrWsId}/tasks/boards/*`,
        ],
        icon: createDashboardNavigationIcon('CheckCircle2', 'h-5 w-5'),
        external: true,
        experimental: 'beta',
        preferencePlacement: 'root',
        preferenceSectionLabel: sidebarSections.core,
      },
    ] satisfies DashboardNavigationLink[];
  }

  const { withoutPermission } = workspacePermissions;
  // Compute effective invoice visibility
  // Default: disabled for personal, enabled for non-personal
  const invoiceWorkspaceDefault = !isPersonal;
  const userInvoiceValue = userInvoiceVisibilityConfig.data?.value;
  const workspaceInvoiceValue = workspaceInvoiceVisibilityConfig.data?.value;

  // Parse workspace setting (stored as string 'true'/'false')
  const workspaceShowInvoices =
    workspaceInvoiceValue !== undefined && workspaceInvoiceValue !== null
      ? String(workspaceInvoiceValue) === 'true'
      : invoiceWorkspaceDefault;

  // Parse user setting - if it's '__workspace_default__' or undefined, use workspace setting
  const showInvoices =
    userInvoiceValue === undefined ||
    userInvoiceValue === null ||
    userInvoiceValue === '__workspace_default__'
      ? workspaceShowInvoices
      : String(userInvoiceValue) === 'true';
  const enabledTaskNavigationConfigIds = new Set(
    (userTaskNavigationConfigs.data ?? [])
      .filter((config) => String(config.value) === 'true')
      .map((config) => config.id)
  );
  const isTaskNavigationEnabled = (configId: string) =>
    enabledTaskNavigationConfigIds.has(configId);
  const sidebarSections = {
    ai: t('sidebar_sections.ai'),
    core: t('sidebar_sections.core'),
    operations: t('sidebar_sections.operations'),
    utilities: t('sidebar_sections.utilities'),
    workTools: t('sidebar_sections.work_tools'),
  };

  const taskNavigationDisabled =
    ENABLE_AI_ONLY || withoutPermission('manage_projects');
  const secondaryTaskNavigationChildren: DashboardNavigationLink[] = [
    ...(isTaskNavigationEnabled(TASK_NAVIGATION_PROGRESS_CONFIG_ID)
      ? [
          {
            title: t('task-progress.tabs.progress'),
            href: `${tasksAppHref}/progress`,
            icon: createDashboardNavigationIcon('ChartArea', 'h-5 w-5'),
            disabled: taskNavigationDisabled,
            external: true,
          } satisfies DashboardNavigationLink,
        ]
      : []),
    ...(isTaskNavigationEnabled(TASK_NAVIGATION_GOALS_CONFIG_ID)
      ? [
          {
            title: t('task-progress.tabs.goals'),
            href: `${tasksAppHref}/goals`,
            icon: createDashboardNavigationIcon('CheckCircle2', 'h-5 w-5'),
            disabled: taskNavigationDisabled,
            external: true,
          } satisfies DashboardNavigationLink,
        ]
      : []),
    ...(isTaskNavigationEnabled(TASK_NAVIGATION_STATS_CONFIG_ID)
      ? [
          {
            title: t('task-progress.tabs.stats'),
            href: `${tasksAppHref}/stats`,
            icon: createDashboardNavigationIcon('ChartColumn', 'h-5 w-5'),
            disabled: taskNavigationDisabled,
            external: true,
          } satisfies DashboardNavigationLink,
        ]
      : []),
    ...(isTaskNavigationEnabled(TASK_NAVIGATION_LEADERBOARDS_CONFIG_ID)
      ? [
          {
            title: t('task-progress.tabs.leaderboards'),
            href: `${tasksAppHref}/leaderboards`,
            icon: createDashboardNavigationIcon('Users', 'h-5 w-5'),
            disabled: taskNavigationDisabled,
            external: true,
          } satisfies DashboardNavigationLink,
        ]
      : []),
    ...(isTaskNavigationEnabled(TASK_NAVIGATION_IMPORT_CONFIG_ID)
      ? [
          {
            title: t('task-progress.tabs.import'),
            href: `${tasksAppHref}/import`,
            icon: createDashboardNavigationIcon('Upload', 'h-5 w-5'),
            disabled: taskNavigationDisabled,
            external: true,
          } satisfies DashboardNavigationLink,
        ]
      : []),
  ];
  const taskNavigationChildren: (DashboardNavigationLink | null)[] = [
    {
      title: t('sidebar_tabs.tasks'),
      href: `${tasksAppHref}/tasks`,
      aliases: [`/${personalOrWsId}/tasks/boards/*`],
      icon: createDashboardNavigationIcon('CheckCircle2', 'h-5 w-5'),
      disabled: taskNavigationDisabled,
      external: true,
      matchExact: true,
    },
    ...(secondaryTaskNavigationChildren.length
      ? [null, ...secondaryTaskNavigationChildren]
      : []),
  ];

  const navLinks: (DashboardNavigationLink | null)[] = [
    {
      id: 'dashboard',
      title: t('common.dashboard'),
      href: `/${personalOrWsId}`,
      icon: createDashboardNavigationIcon('ChartArea', 'h-5 w-5'),
      matchExact: true,
      preferenceLocked: true,
      preferencePlacement: 'root',
      preferenceSectionLabel: sidebarSections.core,
    },
    null,
    {
      id: 'tasks',
      title: t('sidebar_tabs.tasks'),
      href: `${tasksAppHref}/tasks`,
      aliases: [
        `/${personalOrWsId}/tasks`,
        `/${personalOrWsId}/tasks/boards`,
        `/${personalOrWsId}/tasks/progress`,
        `/${personalOrWsId}/tasks/goals`,
        `/${personalOrWsId}/tasks/stats`,
        `/${personalOrWsId}/tasks/leaderboards`,
        `/${personalOrWsId}/tasks/import`,
      ],
      icon: createDashboardNavigationIcon('CheckCircle2', 'h-5 w-5'),
      disabled: taskNavigationDisabled,
      external: true,
      experimental: 'beta',
      preferencePlacement: 'root',
      preferenceSectionLabel: sidebarSections.core,
      children: taskNavigationChildren,
    },
    {
      id: 'habits',
      title: t('sidebar_tabs.habits'),
      href: `${tasksAppHref}/habits`,
      aliases: [`/${personalOrWsId}/habits`, `/${personalOrWsId}/tasks/habits`],
      icon: createDashboardNavigationIcon('Repeat', 'h-5 w-5'),
      external: true,
      disabled: !ENABLE_HABITS,
      preferenceSectionLabel: sidebarSections.workTools,
    },
    {
      id: 'calendar',
      title: t('sidebar_tabs.calendar'),
      icon: createDashboardNavigationIcon('Calendar', 'h-5 w-5'),
      href: calendarAppHref,
      external: true,
      disabled: ENABLE_AI_ONLY || withoutPermission('manage_calendar'),
      preferencePlacement: 'root',
      preferenceSectionLabel: sidebarSections.core,
    },
    {
      id: 'contacts',
      title: t('sidebar_tabs.contacts'),
      icon: createDashboardNavigationIcon('BookUser', 'h-5 w-5'),
      href: contactsAppHref,
      external: true,
      disabled:
        withoutPermission('manage_users') &&
        withoutPermission('view_users_public_info'),
      preferencePlacement: 'root',
      preferenceSectionLabel: sidebarSections.core,
    },
    {
      id: 'whiteboards',
      title: t('sidebar_tabs.whiteboards'),
      href: `/${personalOrWsId}/whiteboards`,
      icon: createDashboardNavigationIcon('PencilRuler', 'h-5 w-5'),
      requiredWorkspaceTier: createTierRequirement('whiteboards', {
        alwaysShow: true,
      }),
      preferenceSectionLabel: sidebarSections.workTools,
    },
    {
      id: 'finance',
      title: t('sidebar_tabs.finance'),
      href: financeAppHref,
      icon: createDashboardNavigationIcon('BadgeDollarSign', 'h-5 w-5'),
      experimental: 'beta',
      preferencePlacement: 'root',
      preferenceSectionLabel: sidebarSections.core,
      aliases: [
        `/${personalOrWsId}/finance`,
        `/${personalOrWsId}/finance/transactions`,
        `/${personalOrWsId}/finance/recurring`,
        `/${personalOrWsId}/finance/wallets`,
        `/${personalOrWsId}/finance/budgets`,
        `/${personalOrWsId}/finance/analytics`,
        `/${personalOrWsId}/finance/categories`,
        `/${personalOrWsId}/finance/transactions/categories`,
        `/${personalOrWsId}/finance/tags`,
        `/${personalOrWsId}/finance/invoices`,
        `/${personalOrWsId}/finance/debts`,
        `/${personalOrWsId}/finance/settings`,
      ],
      external: true,
      children: [
        // ── Finance: Core ──
        {
          title: t('workspace-finance-tabs.overview'),
          href: financeAppHref,
          icon: createDashboardNavigationIcon('LayoutDashboard', 'h-5 w-5'),
          matchExact: true,
          disabled: withoutPermission('manage_finance'),
        },
        {
          title: t('workspace-finance-tabs.transactions'),
          href: `${financeAppHref}/transactions`,
          matchExact: true,
          icon: createDashboardNavigationIcon('Banknote', 'h-5 w-5'),
          disabled: withoutPermission('view_transactions'),
        },
        {
          title: t('workspace-finance-tabs.recurring'),
          href: `${financeAppHref}/recurring`,
          icon: createDashboardNavigationIcon('Repeat', 'h-5 w-5'),
          disabled: withoutPermission('view_transactions'),
        },
        {
          title: t('workspace-finance-tabs.wallets'),
          href: `${financeAppHref}/wallets`,
          icon: createDashboardNavigationIcon('Wallet', 'h-5 w-5'),
          disabled: withoutPermission('view_transactions'),
        },
        {
          title: t('workspace-finance-tabs.budgets'),
          href: `${financeAppHref}/budgets`,
          icon: createDashboardNavigationIcon('ChartColumn', 'h-5 w-5'),
          disabled: withoutPermission('manage_finance'),
        },
        null,
        // ── Finance: Insights ──
        {
          title: t('workspace-finance-tabs.analytics'),
          href: `${financeAppHref}/analytics`,
          icon: createDashboardNavigationIcon('ChartArea', 'h-5 w-5'),
          disabled: withoutPermission('manage_finance'),
        },
        null,
        // ── Finance: Records ──
        {
          title: t('workspace-finance-tabs.invoices'),
          href: `${financeAppHref}/invoices`,
          icon: createDashboardNavigationIcon('ReceiptText', 'h-5 w-5'),
          disabled: !showInvoices || withoutPermission('view_invoices'),
        },
        {
          title: t('workspace-finance-tabs.debts'),
          href: `${financeAppHref}/debts`,
          icon: createDashboardNavigationIcon('HandCoins', 'h-5 w-5'),
          disabled: withoutPermission('view_transactions'),
        },
        null,
        // ── Finance: Configuration ──
        {
          title: t('workspace-finance-tabs.categories'),
          href: `${financeAppHref}/categories`,
          icon: createDashboardNavigationIcon('Group', 'h-5 w-5'),
          disabled: withoutPermission('manage_finance'),
        },
        {
          title: t('workspace-finance-tabs.tags'),
          href: `${financeAppHref}/tags`,
          icon: createDashboardNavigationIcon('Tags', 'h-5 w-5'),
          disabled: withoutPermission('manage_finance'),
        },
      ],
      disabled: ENABLE_AI_ONLY,
    },
    {
      id: 'time_tracker',
      title: t('sidebar_tabs.track'),
      href: trackAppHref,
      icon: createDashboardNavigationIcon('ClockFading', 'h-5 w-5'),
      experimental: 'beta',
      aliases: [
        `/${personalOrWsId}/time-tracker`,
        `/${personalOrWsId}/time-tracker/timer`,
        `/${personalOrWsId}/time-tracker/history`,
        `/${personalOrWsId}/time-tracker/management`,
        `/${personalOrWsId}/time-tracker/requests`,
      ],
      external: true,
      children: [
        // ── Time Tracking ──
        {
          title: t('sidebar_tabs.overview'),
          href: trackAppHref,
          icon: createDashboardNavigationIcon('LayoutDashboard', 'h-5 w-5'),
          matchExact: true,
          requiredWorkspaceTier: createTierRequirement('time_tracker', {
            alwaysShow: true,
          }),
        },
        {
          title: t('sidebar_tabs.timer'),
          href: `${trackAppHref}/timer`,
          icon: createDashboardNavigationIcon('Timer', 'h-5 w-5'),
          requiredWorkspaceTier: createTierRequirement('time_tracker', {
            alwaysShow: true,
          }),
        },
        {
          title: t('sidebar_tabs.history'),
          href: `${trackAppHref}/history`,
          icon: createDashboardNavigationIcon('ClipboardClock', 'h-5 w-5'),
          requiredWorkspaceTier: createTierRequirement('time_tracker', {
            alwaysShow: true,
          }),
        },
        null,
        {
          title: t('sidebar_tabs.time_tracker_management'),
          href: `${trackAppHref}/management`,
          icon: createDashboardNavigationIcon('ChartGantt', 'h-5 w-5'),
          requireRootWorkspace: true,
          requireRootMember: true,
          requiredWorkspaceTier: createTierRequirement('time_tracker', {
            alwaysShow: true,
          }),
        },
        {
          title: t('sidebar_tabs.time_tracker_requests'),
          href: `${trackAppHref}/requests`,
          icon: createDashboardNavigationIcon('ClockCheck', 'h-5 w-5'),
          disabled: isPersonal,
          requiredWorkspaceTier: createTierRequirement('time_tracker', {
            alwaysShow: true,
          }),
        },
      ],
      disabled: ENABLE_AI_ONLY,
      preferenceSectionLabel: sidebarSections.workTools,
    },
    {
      id: 'drive',
      title: t('sidebar_tabs.drive'),
      href: driveAppHref,
      icon: createDashboardNavigationIcon('HardDrive', 'h-5 w-5'),
      requiredWorkspaceTier: createTierRequirement('drive', {
        alwaysShow: true,
      }),
      disabled: withoutPermission('manage_drive'),
      experimental: 'beta',
      external: true,
      preferenceSectionLabel: sidebarSections.workTools,
    },
    null,
    null,
    {
      id: 'forms',
      title: t('sidebar_tabs.forms'),
      href: formsAppHref,
      external: true,
      icon: createDashboardNavigationIcon('ClipboardList', 'h-5 w-5'),
      disabled:
        withoutPermission('manage_forms') &&
        withoutPermission('view_form_analytics'),
      preferenceSectionLabel: sidebarSections.workTools,
    },
    null,
    // ── Vertical 5: More (collapsed features) ──
    {
      id: 'more_tools',
      title: t('sidebar_tabs.more_tools'),
      icon: createDashboardNavigationIcon('SquareChevronRight', 'h-5 w-5'),
      children: [
        {
          id: 'documents',
          title: t('sidebar_tabs.documents'),
          href: `/${personalOrWsId}/documents`,
          icon: createDashboardNavigationIcon('FileText', 'h-5 w-5'),
          disabled:
            ENABLE_AI_ONLY ||
            !hasSecret('ENABLE_DOCS', 'true') ||
            withoutPermission('manage_documents'),
          requiredWorkspaceTier: createTierRequirement('documents', {
            alwaysShow: true,
          }),
          experimental: 'beta',
          preferenceSectionLabel: sidebarSections.workTools,
        },
        {
          id: 'mind',
          title: t('sidebar_tabs.mind'),
          icon: createDashboardNavigationIcon('BrainCircuit', 'h-5 w-5'),
          href: mindAppHref,
          external: true,
          preferenceSectionLabel: sidebarSections.ai,
        },
        {
          id: 'hive',
          title: t('sidebar_tabs.hive'),
          icon: createDashboardNavigationIcon('Blocks', 'h-5 w-5'),
          href: hiveAppHref,
          external: true,
          preferenceSectionLabel: sidebarSections.ai,
        },
        {
          id: 'chat',
          title: t('sidebar_tabs.chat'),
          href: chatAppHref,
          icon: createDashboardNavigationIcon('MessageCircleIcon', 'h-5 w-5'),
          aliases: [`/${personalOrWsId}/chat`],
          external: true,
          disabled: withoutPermission('view_chat'),
          requiredWorkspaceTier: createTierRequirement('chat', {
            alwaysShow: true,
          }),
          experimental: 'beta',
          preferenceSectionLabel: sidebarSections.ai,
        },
        {
          id: 'qr_generator',
          title: t('sidebar_tabs.qr_generator'),
          href: qrAppHref,
          icon: createDashboardNavigationIcon('QrCodeIcon', 'h-5 w-5'),
          aliases: [`/${personalOrWsId}/qr-generator`],
          external: true,
          preferenceSectionLabel: sidebarSections.utilities,
        },
        null,
        {
          id: 'workforce',
          title: t('sidebar_tabs.workforce'),
          href: `${contactsAppHref}/workforce`,
          external: true,
          icon: createDashboardNavigationIcon('BriefcaseBusiness', 'h-5 w-5'),
          requiredWorkspaceTier: createTierRequirement('workforce', {
            alwaysShow: true,
          }),
          children: [
            {
              title: t('workspace-workforce-tabs.directory'),
              href: `${contactsAppHref}/workforce`,
              icon: createDashboardNavigationIcon('Users', 'h-5 w-5'),
              matchExact: true,
              disabled:
                withoutPermission('view_workforce') &&
                withoutPermission('manage_workforce'),
            },
            {
              title: t('workspace-workforce-tabs.contracts'),
              href: `${contactsAppHref}/workforce/contracts`,
              icon: createDashboardNavigationIcon('ScrollText', 'h-5 w-5'),
              disabled: withoutPermission('manage_workforce'),
            },
            null,
            {
              title: t('workspace-workforce-tabs.payroll'),
              href: `${contactsAppHref}/workforce/payroll`,
              icon: createDashboardNavigationIcon('HandCoins', 'h-5 w-5'),
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
          tempDisabled: true, // coming soon
          preferenceSectionLabel: sidebarSections.operations,
        },
        {
          id: 'posts',
          title: t('sidebar_tabs.posts'),
          href: `${contactsAppHref}/posts`,
          icon: createDashboardNavigationIcon('GalleryVerticalEnd', 'h-5 w-5'),
          disabled:
            !hasSecret('ENABLE_EMAIL_SENDING', 'true') ||
            (!DEV_MODE && ENABLE_AI_ONLY) ||
            (withoutPermission('view_user_groups_posts') &&
              withoutPermission('approve_posts')),
          experimental: 'beta',
          external: true,
          preferenceSectionLabel: sidebarSections.operations,
        },
        {
          id: 'inventory',
          title: t('sidebar_tabs.inventory'),
          icon: createDashboardNavigationIcon('Archive', 'h-5 w-5'),
          href: inventoryAppHref,
          external: true,
          requiredWorkspaceTier: createTierRequirement('inventory', {
            alwaysShow: true,
          }),
          disabled: ENABLE_AI_ONLY || withoutPermission('view_inventory'),
          preferenceSectionLabel: sidebarSections.operations,
        },
        null,
        // AI Lab, Google Workspace, and utility tools
        {
          id: 'ai_lab',
          title: t('sidebar_tabs.ai_lab'),
          icon: createDashboardNavigationIcon('Box', 'h-5 w-5'),
          requiredWorkspaceTier: createTierRequirement('ai_lab', {
            alwaysShow: true,
          }),
          children: [
            {
              title: t('sidebar_tabs.spark'),
              href: `/${personalOrWsId}/ai/spark`,
              icon: createDashboardNavigationIcon('Sparkles', 'h-5 w-5'),
              disabled:
                ENABLE_AI_ONLY ||
                !hasSecret('ENABLE_TASKS', 'true') ||
                withoutPermission('manage_projects'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.chat_with_ai'),
              href: `/${personalOrWsId}/ai-chat`,
              icon: createDashboardNavigationIcon(
                'MessageCircleIcon',
                'h-5 w-5'
              ),
              disabled:
                ENABLE_AI_ONLY ||
                !hasSecret('ENABLE_CHAT', 'true') ||
                withoutPermission('ai_chat'),
              experimental: 'beta',
            },
            {
              title: t('sidebar_tabs.memories'),
              href: `/${personalOrWsId}/memories`,
              icon: createDashboardNavigationIcon('BrainCircuit', 'h-5 w-5'),
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'beta',
            },
            {
              title: t('sidebar_tabs.ai_executions'),
              href: `/${personalOrWsId}/ai/executions`,
              icon: createDashboardNavigationIcon('Cctv', 'h-5 w-5'),
              requireRootWorkspace: true,
              requireRootMember: true,
              disabled: withoutPermission('manage_workspace_roles'),
            },
            {
              title: t('sidebar_tabs.models'),
              href: `/${personalOrWsId}/models`,
              icon: createDashboardNavigationIcon('Box', 'h-5 w-5'),
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.datasets'),
              href: `/${personalOrWsId}/datasets`,
              icon: createDashboardNavigationIcon('Database', 'h-5 w-5'),
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'beta',
            },
            {
              title: t('sidebar_tabs.pipelines'),
              href: `/${personalOrWsId}/pipelines`,
              icon: createDashboardNavigationIcon('Play', 'h-5 w-5'),
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.crawlers'),
              href: `/${personalOrWsId}/crawlers`,
              icon: createDashboardNavigationIcon('ScanSearch', 'h-5 w-5'),
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.cron'),
              href: `/${personalOrWsId}/cron`,
              icon: createDashboardNavigationIcon('Clock', 'h-5 w-5'),
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
            {
              title: t('sidebar_tabs.queues'),
              href: `/${personalOrWsId}/queues`,
              icon: createDashboardNavigationIcon('Logs', 'h-5 w-5'),
              disabled:
                !hasSecret('ENABLE_AI', 'true') || withoutPermission('ai_lab'),
              experimental: 'alpha',
            },
          ],
          preferenceSectionLabel: sidebarSections.ai,
        },
        {
          id: 'google_workspace',
          title: t('sidebar_tabs.google_workspace'),
          icon: createDashboardNavigationIcon('ScreenShare', 'h-5 w-5'),
          requireRootWorkspace: true,
          requireRootMember: true,
          children: [
            {
              title: t('sidebar_tabs.drive'),
              icon: createDashboardNavigationIcon('HardDrive', 'h-5 w-5'),
              href: 'https://drive.google.com/a/tuturuuu.com',
              external: true,
              newTab: true,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
            {
              title: t('sidebar_tabs.mail'),
              icon: createDashboardNavigationIcon('Mail', 'h-5 w-5'),
              href: 'https://mail.google.com/a/tuturuuu.com',
              external: true,
              newTab: true,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
            {
              title: t('sidebar_tabs.calendar'),
              icon: createDashboardNavigationIcon('Calendar', 'h-5 w-5'),
              href: 'https://www.google.com/calendar/hosted/tuturuuu.com',
              external: true,
              newTab: true,
              requireRootWorkspace: true,
              requireRootMember: true,
            },
            // {
            //   title: t('sidebar_tabs.groups'),
            //   icon: createDashboardNavigationIcon('Users', 'h-5 w-5'),
            //   href: 'https://groups.google.com/a/tuturuuu.com',
            //   external: true,
            //   newTab: true,
            //   requireRootWorkspace: true,
            //   requireRootMember: true,
            // },
            // {
            //   title: t('sidebar_tabs.sites'),
            //   icon: createDashboardNavigationIcon('PanelsTopLeft', 'h-5 w-5'),
            //   href: 'https://sites.google.com/a/tuturuuu.com',
            //   external: true,
            //   newTab: true,
            //   requireRootWorkspace: true,
            //   requireRootMember: true,
            // },
          ],
          preferenceSectionLabel: sidebarSections.utilities,
        },
        {
          id: 'meet',
          title: t('sidebar_tabs.meet'),
          href: meetAppHref,
          icon: createDashboardNavigationIcon('SquaresIntersect', 'h-5 w-5'),
          preferenceSectionLabel: sidebarSections.utilities,
          external: true,
          children: [
            {
              title: t('sidebar_tabs.plans'),
              href: `${meetAppHref}/plans`,
              icon: createDashboardNavigationIcon('VectorSquare', 'h-5 w-5'),
            },
            {
              title: t('sidebar_tabs.meetings'),
              href: `${meetAppHref}/meetings`,
              icon: createDashboardNavigationIcon('SquareUserRound', 'h-5 w-5'),
              requireRootWorkspace: true,
              requireRootMember: true,
            },
          ],
        },
        {
          id: 'polls',
          title: t('sidebar_tabs.polls'),
          href: `/${personalOrWsId}/polls`,
          icon: createDashboardNavigationIcon('Vote', 'h-5 w-5'),
          disabled: !DEV_MODE,
          requireRootWorkspace: true,
          requireRootMember: true,
          preferenceSectionLabel: sidebarSections.utilities,
        },
        {
          id: 'mail',
          title: t('sidebar_tabs.mail'),
          href: mailAppHref,
          icon: createDashboardNavigationIcon('Mail', 'h-5 w-5'),
          external: true,
          requireRootMember: true,
          disabled: !isMailUser,
          experimental: 'beta',
          preferenceSectionLabel: sidebarSections.utilities,
          children: [
            {
              title: t('mail.inbox'),
              href: mailAppHref,
              icon: createDashboardNavigationIcon('Mail', 'h-5 w-5'),
              external: true,
              disabled: !isMailUser,
            },
            {
              title: t('mail.starred'),
              href: `${mailAppHref}?folder=starred`,
              icon: createDashboardNavigationIcon('Star', 'h-5 w-5'),
              external: true,
              disabled: !isMailUser,
            },
            {
              title: t('mail.sent'),
              href: `${mailAppHref}?folder=sent`,
              icon: createDashboardNavigationIcon('Send', 'h-5 w-5'),
              external: true,
              disabled: !isMailUser,
            },
            {
              title: t('mail.drafts'),
              href: `${mailAppHref}?folder=drafts`,
              icon: createDashboardNavigationIcon('TextSelect', 'h-5 w-5'),
              external: true,
              disabled: !isMailUser,
            },
            {
              title: t('mail.spam'),
              href: `${mailAppHref}?folder=spam`,
              icon: createDashboardNavigationIcon('TriangleAlert', 'h-5 w-5'),
              external: true,
              disabled: !isMailUser,
            },
            {
              title: t('mail.trash'),
              href: `${mailAppHref}?folder=trash`,
              icon: createDashboardNavigationIcon('Trash', 'h-5 w-5'),
              external: true,
              disabled: !isMailUser,
            },
          ],
        },
        {
          id: 'link_shortener',
          title: t('sidebar_tabs.link_shortener'),
          href: `/${personalOrWsId}/link-shortener`,
          icon: createDashboardNavigationIcon('Link', 'h-5 w-5'),
          disabled:
            resolvedWorkspaceId !== ROOT_WORKSPACE_ID &&
            !hasSecret('ENABLE_LINK_SHORTENER', 'true'),
          preferenceSectionLabel: sidebarSections.utilities,
        },
      ],
    },
    createWorkspaceMembersNavigationLink({
      canManageMembers: !withoutPermission('manage_workspace_members'),
      isPersonal,
      preferenceSectionLabel: sidebarSections.utilities,
      t,
    }),
    {
      id: 'settings',
      title: t('common.settings'),
      icon: createDashboardNavigationIcon('Settings', 'h-5 w-5'),
      openSettingsDialog: true,
      preferenceLocked: true,
      preferencePlacement: 'root',
      preferenceSectionLabel: sidebarSections.utilities,
      aliases: [
        `/${personalOrWsId}/settings`,
        `/${personalOrWsId}/settings/*`,
        `/${personalOrWsId}/members`,
        `/${personalOrWsId}/members/*`,
        `/${personalOrWsId}/teams`,
        `/${personalOrWsId}/teams/*`,
        `/${personalOrWsId}/roles`,
        `/${personalOrWsId}/roles/*`,
        `/${personalOrWsId}/billing`,
        `/${personalOrWsId}/billing/*`,
        `/${personalOrWsId}/usage`,
        `/${personalOrWsId}/usage/*`,
        `/${personalOrWsId}/api-keys`,
        `/${personalOrWsId}/api-keys/*`,
        `/${personalOrWsId}/secrets`,
        `/${personalOrWsId}/secrets/*`,
        `/${personalOrWsId}/integrations`,
        `/${personalOrWsId}/integrations/*`,
        `/${personalOrWsId}/inquiries`,
      ],
    },
  ];

  /**
   * Remove consecutive nulls to avoid repeated separators in navigation.
   * Also removes leading and trailing nulls.
   * @param arr - Array of NavLinks and nulls (where null represents a separator)
   * @returns Cleaned array with no consecutive nulls and no leading/trailing nulls
   */
  const removeConsecutiveNulls = (
    arr: (DashboardNavigationLink | null)[]
  ): (DashboardNavigationLink | null)[] => {
    const withoutConsecutive = arr.reduce<(DashboardNavigationLink | null)[]>(
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
  return removeConsecutiveNulls(
    navLinks
  ) satisfies (DashboardNavigationLink | null)[];
}
