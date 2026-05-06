import { PracticePage } from '@/components/learner-pages';

export default async function LearnerPracticePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <PracticePage wsId={wsId} />;
}
