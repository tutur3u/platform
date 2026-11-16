import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { Locale } from '@/i18n/routing';
import { getCalendarAppOrigin } from '@/lib/calendar-app-url';
import { getFinanceAppOrigin } from '@/lib/finance-app-url';
import { getTasksAppOrigin } from '@/lib/tasks-app-url';
import { getTrackAppOrigin } from '@/lib/track-app-url';
import MiraDashboardClient from './components/mira-dashboard-client';
import { parseMiraDraftPrompt } from './mira-draft-prompt';
import { type OverviewCards, WorkspaceOverview } from './workspace-overview';

const DEFAULT_ASSISTANT_NAME = 'Mira';

async function UserGroupQuickActionsSlot({ wsId }: { wsId: string }) {
  const { default: UserGroupQuickActions } =
    await import('./user-groups/quick-actions');

  return <UserGroupQuickActions wsId={wsId} />;
}

async function PermissionSetupBannerSlot({
  isCreator,
  wsId,
}: {
  isCreator: boolean;
  wsId: string;
}) {
  if (!isCreator) return null;

  const { default: PermissionSetupBanner } =
    await import('./permission-setup-banner');

  return <PermissionSetupBanner wsId={wsId} isCreator />;
}

async function ensureDashboardAccess({
  user,
  wsId,
}: {
  user: {
    email?: string | null;
    id: string;
  };
  wsId: string;
}): Promise<OverviewCards> {
  const { getPermissions, verifySecret } =
    await import('@tuturuuu/utils/workspace-helper');
  const [permissions, aiOnly] = await Promise.all([
    getPermissions({ user, wsId }),
    verifySecret({
      wsId,
      forceAdmin: true,
      name: 'ENABLE_AI_ONLY',
      value: 'true',
    }),
  ]);
  if (!permissions) notFound();

  // Cards mirror the sidebar gates for the same apps, so the overview never
  // shows a surface the navigation hides. The time tracker entry has no
  // permission gate; Finance amounts need `view_transactions`, which the
  // Finance route enforces again.
  const { containsPermission } = permissions;
  return {
    showAgenda: !aiOnly && containsPermission('manage_calendar'),
    showTasks: !aiOnly && containsPermission('manage_projects'),
    showTime: true,
    showFinance: containsPermission('view_transactions'),
    canLogTransaction: containsPermission('create_transactions'),
  };
}

async function resolveDashboardWorkspace(routeWsId: string) {
  const [{ getCurrentUser }, { getWorkspace }] = await Promise.all([
    import('@tuturuuu/utils/user-helper'),
    import('@tuturuuu/utils/workspace-helper'),
  ]);

  const currentUser = await getCurrentUser();
  if (!currentUser) notFound();

  const workspace = await getWorkspace(routeWsId, {
    useAdmin: true,
    user: {
      email: currentUser.email ?? null,
      id: currentUser.id,
    },
  });
  if (!workspace) notFound();

  return { currentUser, workspace };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.metadata');

  return {
    title: t('title'),
    description: t('description'),
  };
}

interface Props {
  params: Promise<{
    locale: Locale;
    wsId: string;
  }>;
  searchParams?: Promise<{ prompt?: string | string[] }>;
}

export default async function WorkspaceHomePage({
  params,
  searchParams,
}: Props) {
  await connection();

  const { wsId: routeWsId } = await params;
  const initialDraft = parseMiraDraftPrompt((await searchParams)?.prompt);
  const { currentUser, workspace } = await resolveDashboardWorkspace(routeWsId);

  const wsId = workspace.id;
  const isCreator = workspace.creator_id === currentUser.id;
  const cards = await ensureDashboardAccess({
    user: {
      email: currentUser.email ?? null,
      id: currentUser.id,
    },
    wsId,
  });

  return (
    <WorkspaceOverview
      wsId={wsId}
      isPersonal={workspace.personal === true}
      timeZone={workspace.timezone ?? null}
      cards={cards}
      links={{
        tasksHref: `${getTasksAppOrigin()}/${routeWsId}/tasks`,
        calendarHref: `${getCalendarAppOrigin()}/${routeWsId}`,
        trackHref: `${getTrackAppOrigin()}/${routeWsId}`,
        financeHref: `${getFinanceAppOrigin()}/${routeWsId}`,
        newTaskHref: `${getTasksAppOrigin()}/${routeWsId}/tasks/new`,
        logTransactionHref: `${getFinanceAppOrigin()}/${routeWsId}/transactions?create=transaction`,
      }}
      setup={
        workspace.personal ? null : (
          <Suspense fallback={null}>
            <PermissionSetupBannerSlot wsId={wsId} isCreator={isCreator} />
          </Suspense>
        )
      }
      groups={
        workspace.personal ? null : (
          <Suspense fallback={null}>
            <UserGroupQuickActionsSlot wsId={wsId} />
          </Suspense>
        )
      }
      mira={
        <MiraDashboardClient
          currentUser={currentUser}
          initialAssistantName={DEFAULT_ASSISTANT_NAME}
          initialDraft={initialDraft}
          wsId={wsId}
          variant="embedded"
        />
      }
    />
  );
}
