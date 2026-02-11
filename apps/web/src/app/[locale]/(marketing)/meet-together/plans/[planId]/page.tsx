import MeetTogetherPlanDetailsPage from '@tuturuuu/ui/legacy/meet/planId/page';
import type { Metadata } from 'next';
import { BASE_URL } from '@/constants/common';

export const metadata: Metadata = {
  title: 'Meet Together Plan',
  description:
    'Compare features across Meet Together plans and choose the right fit.',
};

interface PlanPageProps {
  params: Promise<{
    planId: string;
  }>;
}

export default async function PlanPage({ params }: PlanPageProps) {
  const baseUrl = BASE_URL;
  return <MeetTogetherPlanDetailsPage params={params} baseUrl={baseUrl} />;
}
