import { BASE_URL } from '@/constants/common';
import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/tumeet/planId/page';
import { Suspense } from 'react';

interface PlanPageProps {
  params: Promise<{
    planId: string;
  }>;
}

export default async function PlanPage({ params }: PlanPageProps) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <MeetTogetherPlanDetailsPage params={params} baseUrl={BASE_URL} />
    </Suspense>
  );
}
