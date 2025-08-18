import { BASE_URL, DEV_MODE } from '@/constants/common';
import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/tumeet/planId/page';
import { redirect } from 'next/navigation';

interface PlanPageProps {
  params: Promise<{
    planId: string;
  }>;
}

export default async function PlanPage({ params }: PlanPageProps) {
  const baseUrl = BASE_URL;
  const { planId } = await params;

  if (!DEV_MODE) {
    // Tumeet is not production-ready yet, so we redirect to the platform app
    redirect(`https://tuturuuu.com/meet-together/plans/${planId}`);
  }

  return <MeetTogetherPlanDetailsPage params={params} baseUrl={baseUrl} />;
}
