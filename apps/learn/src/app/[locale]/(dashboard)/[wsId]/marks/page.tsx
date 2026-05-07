import { MarksPage } from '@/components/learner-pages';

export default async function LearnerMarksPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <MarksPage wsId={wsId} />;
}
