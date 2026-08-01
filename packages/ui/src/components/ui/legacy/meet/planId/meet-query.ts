'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getMeetPlanSnapshot,
  type MeetPlanSnapshot,
} from '@tuturuuu/internal-api';

export const meetPlanQueryKey = (planId: string) =>
  ['meet-plan', planId] as const;

export function useMeetPlanQuery(initialSnapshot: MeetPlanSnapshot) {
  const planId = initialSnapshot.plan.id;
  if (!planId) throw new Error('A Tuturuuu Meet plan id is required');

  return useQuery({
    queryKey: meetPlanQueryKey(planId),
    queryFn: () => getMeetPlanSnapshot(planId),
    initialData: initialSnapshot,
    refetchInterval: (query) =>
      query.state.data?.plan.is_confirmed ? 30_000 : 5_000,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
}
