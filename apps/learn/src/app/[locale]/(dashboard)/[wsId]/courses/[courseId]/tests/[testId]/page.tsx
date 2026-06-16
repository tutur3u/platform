import { notFound } from 'next/navigation';
import { StudentTestDetailPage } from '@/components/learner-pages/student-test-detail-page';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function LearnerTestDetailPage({
  params,
}: {
  params: Promise<{ wsId: string; courseId: string; testId: string }>;
}) {
  const { wsId, courseId, testId } = await params;
  if (!UUID_PATTERN.test(courseId) || !UUID_PATTERN.test(testId)) notFound();
  return (
    <StudentTestDetailPage wsId={wsId} courseId={courseId} testId={testId} />
  );
}
