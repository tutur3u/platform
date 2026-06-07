import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';

const MiraDashboardClient = dynamic(
  () => import('./components/mira-dashboard-client'),
  {
    loading: () => <LoadingStatisticCard />,
  }
);

const DEFAULT_ASSISTANT_NAME = 'Mira';

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
  isCreator,
  wsId,
}: {
  isCreator: boolean;
  wsId: string;
}) {
  if (isCreator) return;

  const { getPermissions } = await import('@tuturuuu/utils/workspace-helper');
  const permissions = await getPermissions({ wsId });
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
  const { wsId: routeWsId } = await params;
  const { currentUser, workspace } = await resolveDashboardWorkspace(routeWsId);

  const wsId = workspace.id;
  const isCreator = workspace.creator_id === currentUser.id;
  await ensureDashboardAccess({ isCreator, wsId });

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
        <Suspense fallback={<LoadingStatisticCard />}>
          <DashboardInsightsSlot wsId={wsId} userId={currentUser.id} />
        </Suspense>
      </MiraDashboardClient>
    </>
  );
}
