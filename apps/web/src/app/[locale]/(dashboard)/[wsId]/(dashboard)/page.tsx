import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import WorkspaceWrapper from '@/components/workspace-wrapper';

const MiraDashboardClient = dynamic(
  () => import('./components/mira-dashboard-client'),
  {
    loading: () => <LoadingStatisticCard />,
  }
);
const PermissionSetupBanner = dynamic(
  () => import('./permission-setup-banner'),
  {
    loading: () => null,
  }
);

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
  return (
    <WorkspaceWrapper params={params} fallback={<LoadingStatisticCard />}>
      {async ({ workspace, wsId }) => {
        const currentUser = await getCurrentUser();
        if (!currentUser) notFound();

        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();

        // Fetch mira_soul for assistant name
        const supabase = await createClient();
        const { data: soul } = await supabase
          .from('mira_soul')
          .select('name')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        const assistantName = soul?.name ?? 'Mira';

        return (
          <>
            {/* Permission setup banner for workspace creators */}
            {!workspace.personal && (
              <PermissionSetupBanner
                wsId={wsId}
                isCreator={workspace.creator_id === currentUser.id}
              />
            )}

            <Suspense fallback={null}>
              <UserGroupQuickActionsSlot wsId={wsId} />
            </Suspense>

            <MiraDashboardClient
              currentUser={currentUser}
              initialAssistantName={assistantName}
              wsId={wsId}
            >
              <Suspense fallback={<LoadingStatisticCard />}>
                <DashboardInsightsSlot wsId={wsId} userId={currentUser.id} />
              </Suspense>
            </MiraDashboardClient>
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
