'use client';

import type { MeetPlanSnapshot } from '@tuturuuu/internal-api';
import type { User as PlatformUser } from '@tuturuuu/types/primitives/User';
import { TimeBlockingProvider } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { useMeetPlanQuery } from './meet-query';
import PlanDetailsClient from './plan-details-client';

export function MeetPlanLiveRoot({
  initialSnapshot,
  platformUser,
  baseUrl,
}: {
  initialSnapshot: MeetPlanSnapshot;
  platformUser: PlatformUser | null;
  baseUrl: string;
}) {
  const query = useMeetPlanQuery(initialSnapshot);
  const snapshot = query.data;

  return (
    <TimeBlockingProvider
      key={`${platformUser?.id || 'guest'}-${snapshot.plan.id}`}
      platformUser={platformUser}
      plan={snapshot.plan}
      users={snapshot.users}
      timeblocks={snapshot.timeblocks}
    >
      <PlanDetailsClient
        plan={snapshot.plan}
        polls={snapshot.polls as never}
        users={snapshot.users}
        timeblocks={snapshot.timeblocks}
        finalizedTimeframes={snapshot.finalizedTimeframes}
        isCreator={snapshot.viewer.isCreator}
        isRefreshing={query.isFetching}
        baseUrl={baseUrl}
      />
    </TimeBlockingProvider>
  );
}
