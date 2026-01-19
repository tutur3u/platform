import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import {
  ActiveUsersStatistics,
  PermanentlyArchivedUsersStatistics,
  TemporarilyArchivedUsersStatistics,
  UserGroupsStatistics,
  UserGroupTagsStatistics,
  UserReportsStatistics,
} from '../../(dashboard)/statistics';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Users',
  description: 'Manage Users in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceUsersPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {({wsId}) => (
        <div className="flex min-h-full w-full flex-col">
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Suspense fallback={<LoadingStatisticCard />}>
              <ActiveUsersStatistics wsId={wsId} redirect />
            </Suspense>

            <Suspense fallback={<LoadingStatisticCard />}>
              <PermanentlyArchivedUsersStatistics wsId={wsId} redirect />
            </Suspense>

            <Suspense fallback={<LoadingStatisticCard />}>
              <TemporarilyArchivedUsersStatistics wsId={wsId} redirect />
            </Suspense>

            <Suspense fallback={<LoadingStatisticCard />}>
              <UserGroupsStatistics wsId={wsId} redirect />
            </Suspense>

            <Suspense fallback={<LoadingStatisticCard />}>
              <UserGroupTagsStatistics wsId={wsId} redirect />
            </Suspense>

            <Suspense fallback={<LoadingStatisticCard />}>
              <UserReportsStatistics wsId={wsId} redirect />
            </Suspense>
          </div>
        </div>
      )}
    </WorkspaceWrapper>
  );
}
