import { ReportsPage } from '@/components/learner-pages';

export default async function LearnerReportsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <ReportsPage wsId={wsId} />;
}
