import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import MiraDashboardClient from './components/mira-dashboard-client';

const DEFAULT_ASSISTANT_NAME = 'Mira';

function DashboardInsightFallback() {
  return (
    <div className="group animate-pulse rounded-lg border">
      <div className="p-1 text-center font-semibold text-lg text-transparent">
        ...
      </div>
      <div className="m-2 mt-0 flex items-center justify-center rounded border border-foreground/5 bg-foreground/5 p-4 font-bold text-2xl text-transparent">
        ...
      </div>
    </div>
  );
}

async function DashboardInsightsSlot({
  userId,
  wsId,
}: {
  userId: string;
  wsId: string;
}) {
  const { default: DashboardInsights } = await import(
    './components/dashboard-insights'
  );

  return <DashboardInsights wsId={wsId} userId={userId} />;
}

async function UserGroupQuickActionsSlot({ wsId }: { wsId: string }) {
  const { default: UserGroupQuickActions } = await import(
    './user-groups/quick-actions'
  );

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

  const { default: PermissionSetupBanner } = await import(
    './permission-setup-banner'
  );

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
}) {
  const { getPermissions } = await import('@tuturuuu/utils/workspace-helper');
  const permissions = await getPermissions({ user, wsId });
  if (!permissions) notFound();
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

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your personal AI-powered workspace dashboard.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceHomePage({ params }: Props) {
  await connection();

  const { wsId: routeWsId } = await params;
  const { currentUser, workspace } = await resolveDashboardWorkspace(routeWsId);

  const wsId = workspace.id;
  const isCreator = workspace.creator_id === currentUser.id;
  await ensureDashboardAccess({
    user: {
      email: currentUser.email ?? null,
      id: currentUser.id,
    },
    wsId,
  });

  return (
    <>
      {!workspace.personal && (
        <Suspense fallback={null}>
          <PermissionSetupBannerSlot wsId={wsId} isCreator={isCreator} />
        </Suspense>
      )}

      {!workspace.personal && (
        <Suspense fallback={null}>
          <UserGroupQuickActionsSlot wsId={wsId} />
        </Suspense>
      )}

      <MiraDashboardClient
        currentUser={currentUser}
        initialAssistantName={DEFAULT_ASSISTANT_NAME}
        wsId={wsId}
      >
        <Suspense fallback={<DashboardInsightFallback />}>
          <DashboardInsightsSlot wsId={wsId} userId={currentUser.id} />
        </Suspense>
      </MiraDashboardClient>
    </>
  );
}
