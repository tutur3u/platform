import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/meet/planId/page';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { currentMeetBaseUrl } from '@/runtime/bridge-runtime';

interface PlanPageProps {
  params: Promise<{
    planId: string;
  }>;
}

async function PlanPageContent({ params }: PlanPageProps) {
  await connection();

  const user = await getSatelliteAppSessionUser('meet');

  return (
    <MeetTogetherPlanDetailsPage
      actorUserId={user?.id ?? null}
      params={params}
      baseUrl={currentMeetBaseUrl()}
      planBaseUrl={`${currentMeetBaseUrl()}/plans`}
    />
  );
}

export default function PlanPage({ params }: PlanPageProps) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <PlanPageContent params={params} />
    </Suspense>
  );
}
