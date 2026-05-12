import { notFound } from 'next/navigation';
import { CourseDetailPage } from '@/components/learner-pages/course-detail-page';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function LearnerCourseDetailPage({
  params,
}: {
  params: Promise<{ wsId: string; courseId: string }>;
}) {
  const { wsId, courseId } = await params;
  if (!UUID_PATTERN.test(courseId)) notFound();
  return <CourseDetailPage wsId={wsId} courseId={courseId} />;
}
