import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/meet/planId/page';
import { Suspense } from 'react';
import { BASE_URL } from '@/constants/common';

interface PlanPageProps {
  params: Promise<{
    planId: string;
  }>;
}

export default async function PlanPage({ params }: PlanPageProps) {
  const user = await getSatelliteAppSessionUser('meet');

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <MeetTogetherPlanDetailsPage
        actorUserId={user?.id ?? null}
        params={params}
        baseUrl={BASE_URL}
      />
    </Suspense>
  );
}
