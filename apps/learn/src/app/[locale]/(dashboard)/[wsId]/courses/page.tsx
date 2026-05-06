import { CoursesPage } from '@/components/learner-pages';

export default async function LearnerCoursesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <CoursesPage wsId={wsId} />;
}
