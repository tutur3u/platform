import { AssignmentsPage } from '@/components/learner-pages';

export default async function LearnerAssignmentsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <AssignmentsPage wsId={wsId} />;
}
