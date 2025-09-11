import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/tumeet/planId/page';
import { BASE_URL } from '@/constants/common';

interface PlanPageProps {
  params: Promise<{
    planId: string;
  }>;
}

export default async function PlanPage({ params }: PlanPageProps) {
  const baseUrl = BASE_URL;
  return <MeetTogetherPlanDetailsPage params={params} baseUrl={baseUrl} />;
}
