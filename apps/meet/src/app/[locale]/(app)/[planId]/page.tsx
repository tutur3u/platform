import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/meet/planId/page';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { BASE_URL } from '@/constants/common';

interface PlanPageProps {
  params: Promise<{
    planId: string;
  }>;
}

export default async function PlanPage({ params }: PlanPageProps) {
  const appSessionUser = getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'meet' }
  );

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <MeetTogetherPlanDetailsPage
        actorUserId={appSessionUser?.id ?? null}
        params={params}
        baseUrl={BASE_URL}
      />
    </Suspense>
  );
}
