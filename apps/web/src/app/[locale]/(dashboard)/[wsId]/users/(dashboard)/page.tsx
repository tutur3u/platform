import {
  UserGroupTagsStatistics,
  UserGroupsStatistics,
  UserReportsStatistics,
  UsersStatistics,
} from '../../(dashboard)/statistics';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceUsersPage({ params }: Props) {
  const { wsId } = await params;
  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard />}>
          <UsersStatistics wsId={wsId} redirect />
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
  );
}
