import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/meet/planId/page';
import { BASE_URL } from '@/constants/common';

export default async function MeetPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  return <MeetTogetherPlanDetailsPage params={params} baseUrl={BASE_URL} />;
}
