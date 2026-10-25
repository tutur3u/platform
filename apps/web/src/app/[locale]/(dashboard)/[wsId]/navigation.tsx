import {
  TASK_NAVIGATION_GOALS_CONFIG_ID,
  TASK_NAVIGATION_IMPORT_CONFIG_ID,
  TASK_NAVIGATION_LEADERBOARDS_CONFIG_ID,
  TASK_NAVIGATION_PROGRESS_CONFIG_ID,
  TASK_NAVIGATION_STATS_CONFIG_ID,
  TASK_SECONDARY_NAVIGATION_CONFIG_IDS,
} from '@tuturuuu/internal-api/users';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { notFound } from 'next/navigation';
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
import { getFeedbackStaffIdentity } from '@/lib/product-feedback-staff';
import { getQrAppBaseUrl } from '@/lib/qr-app-url';
import { getTasksAppOrigin } from '@/lib/tasks-app-url';
import { getTrackAppOrigin } from '@/lib/track-app-url';
import {
  createDashboardNavigationIcon,
  type DashboardNavigationLink,
} from './navigation-icon-descriptor';
import { createMoreToolsNavigation } from './navigation-more-tools';
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
  const [supabase, { getTranslations, getLocale }, workspaceNavigationHelpers] =
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

  const workspacePermissionsPromise = getPermissions({
    user,
    wsId: resolvedWorkspaceId,
  });
  const feedbackStaffPromise = isMailUser
    ? workspacePermissionsPromise.then((permissions) =>
        permissions ? getFeedbackStaffIdentity() : null
      )
    : Promise.resolve(null);
  const [
    workspacePermissions,
    userInvoiceVisibilityConfig,
    userTaskNavigationConfigs,
    workspaceInvoiceVisibilityConfig,
    feedbackStaff,
  ] = await Promise.all([
    workspacePermissionsPromise,
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
    feedbackStaffPromise,
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
    ...(feedbackStaff
      ? [
          {
            id: 'product-feedback',
            title: t('product-feedback.title'),
            href: `/${personalOrWsId}/feedback`,
            aliases: [`/${personalOrWsId}/feedback`],
            icon: createDashboardNavigationIcon('ClipboardList', 'h-5 w-5'),
            children: [],
            matchExact: true,
            preferenceSectionLabel: sidebarSections.utilities,
          } satisfies DashboardNavigationLink,
        ]
      : []),
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
    createMoreToolsNavigation({
      t,
      locale: await getLocale(),
      canAccessPasswords: workspacePermissions.membershipType === 'MEMBER',
      personalOrWsId,
      resolvedWorkspaceId,
      ENABLE_AI_ONLY,
      hasSecret,
      withoutPermission,
      sidebarSections,
      isMailUser,
      chatAppHref,
      contactsAppHref,
      hiveAppHref,
      inventoryAppHref,
      mailAppHref,
      meetAppHref,
      mindAppHref,
      qrAppHref,
      isPersonal,
    }),
    !isPersonal &&
    workspacePermissions.membershipType === 'MEMBER' &&
    !withoutPermission('manage_sso_clients')
      ? {
          id: 'workspace-sso-settings',
          title: t('workspace-sso.title'),
          href: `/${personalOrWsId}/sso`,
          aliases: [`/${resolvedWorkspaceId}/sso`],
          icon: createDashboardNavigationIcon('KeyRound', 'h-5 w-5'),
          preferenceSectionLabel: sidebarSections.utilities,
        }
      : null,
    createWorkspaceMembersNavigationLink({
      canManageMembers: !withoutPermission('manage_workspace_members'),
      isPersonal,
      preferenceSectionLabel: sidebarSections.utilities,
      t,
    }),
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
