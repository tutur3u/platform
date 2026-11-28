import {
  getLaunchableApp,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { notFound } from 'next/navigation';
import { getFeedbackStaffIdentity } from '@/lib/product-feedback-staff';
import {
  createDashboardNavigationIcon,
  type DashboardNavigationLink,
} from './navigation-icon-descriptor';
import { createSidebarAppLinks } from './sidebar-apps';

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
  const workspaceHelperModule =
    await import('@tuturuuu/utils/workspace-helper');
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
  const [t, user, secrets, currentOrigin] = await Promise.all([
    getTranslations(),
    providedUser
      ? Promise.resolve(providedUser)
      : import('@tuturuuu/supabase/next/auth-session-user').then(
          async ({ resolveAuthenticatedSessionUser }) =>
            (await resolveAuthenticatedSessionUser(supabase)).user
        ),
    getSecrets({ wsId: resolvedWorkspaceId, forceAdmin: true }),
    getRequestOrigin(),
  ]);
  if (!secrets) notFound();
  const hasSecret = (name: string, value: string) =>
    getSecret(name, secrets)?.value === value;

  const ENABLE_AI_ONLY = hasSecret('ENABLE_AI_ONLY', 'true');
  const isMailUser = isExactTuturuuuDotComEmail(user?.email);

  const workspacePermissionsPromise = getPermissions({
    user,
    wsId: resolvedWorkspaceId,
  });
  const feedbackStaffPromise = isMailUser
    ? workspacePermissionsPromise.then((permissions) =>
        permissions ? getFeedbackStaffIdentity() : null
      )
    : Promise.resolve(null);
  const [workspacePermissions, feedbackStaff] = await Promise.all([
    workspacePermissionsPromise,
    feedbackStaffPromise,
  ]);
  const tasksTitle = t('command_launcher.app_names.tasks');

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

    const tasksApp = getLaunchableApp('tasks');

    return [
      {
        id: 'tasks',
        appSlug: 'tasks',
        title: tasksTitle,
        href: tasksApp
          ? resolveLaunchableAppUrl({
              app: tasksApp,
              currentOrigin,
              workspace: { id: resolvedWorkspaceId, personal: isPersonal },
            })
          : undefined,
        aliases: [`/${personalOrWsId}/tasks/boards/*`],
        icon: createDashboardNavigationIcon('CheckCircle2', 'h-5 w-5'),
        external: true,
        experimental: 'beta',
        preferencePlacement: 'root',
      },
    ] satisfies DashboardNavigationLink[];
  }

  const { withoutPermission } = workspacePermissions;
  const appLinks = createSidebarAppLinks({
    ENABLE_AI_ONLY,
    currentOrigin,
    documentsPageTitles: {
      notes: t('sidebar_tabs.notes'),
      personalJournal: t('personal_journal.title'),
      whiteboards: t('sidebar_tabs.whiteboards'),
    },
    hasSecret,
    isMailUser,
    isPersonal,
    personalOrWsId,
    resolvedWorkspaceId,
    rootWorkspaceId: ROOT_WORKSPACE_ID,
    titles: {
      ai: t('command_launcher.app_names.ai'),
      calendar: t('command_launcher.app_names.calendar'),
      chat: t('command_launcher.app_names.chat'),
      contacts: t('command_launcher.app_names.contacts'),
      documents: t('command_launcher.app_names.documents'),
      drive: t('command_launcher.app_names.drive'),
      finance: t('command_launcher.app_names.finance'),
      forms: t('command_launcher.app_names.forms'),
      hive: t('command_launcher.app_names.hive'),
      inventory: t('command_launcher.app_names.inventory'),
      mail: t('command_launcher.app_names.mail'),
      meet: t('command_launcher.app_names.meet'),
      mind: t('command_launcher.app_names.mind'),
      shortener: t('command_launcher.app_names.shortener'),
      tasks: tasksTitle,
      tools: t('command_launcher.app_names.tools'),
      track: t('command_launcher.app_names.track'),
    },
    withoutPermission,
  });

  return [
    ...(feedbackStaff
      ? [
          {
            id: 'product-feedback',
            title: t('product-feedback.title'),
            href: `/${personalOrWsId}/feedback`,
            aliases: [`/${personalOrWsId}/feedback`],
            icon: createDashboardNavigationIcon('Megaphone', 'h-5 w-5'),
            children: [],
            matchExact: true,
          } satisfies DashboardNavigationLink,
          {
            id: 'chat-reports',
            title: t('chat-reports.title'),
            href: `/${personalOrWsId}/chat-reports`,
            aliases: [`/${personalOrWsId}/chat-reports`],
            icon: createDashboardNavigationIcon('ShieldAlert', 'h-5 w-5'),
            children: [],
            matchExact: true,
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
    },
    ...appLinks,
    ...(!ENABLE_AI_ONLY && !withoutPermission('manage_workspace_settings')
      ? [
          {
            id: 'worlds',
            title: t('worlds.editor.title'),
            href: `/${personalOrWsId}/worlds`,
            aliases: [`/${wsId}/worlds`],
            icon: createDashboardNavigationIcon('Globe', 'h-5 w-5'),
            children: [],
            matchExact: true,
          } satisfies DashboardNavigationLink,
        ]
      : []),
  ] satisfies DashboardNavigationLink[];
}

async function getRequestOrigin() {
  try {
    const { headers } = await import('next/headers');
    const requestHeaders = await headers();
    const host =
      requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
    if (!host) return undefined;
    const protocol =
      requestHeaders.get('x-forwarded-proto') ??
      (host.includes('localhost') ? 'http' : 'https');

    return `${protocol}://${host}`;
  } catch {
    return undefined;
  }
}
