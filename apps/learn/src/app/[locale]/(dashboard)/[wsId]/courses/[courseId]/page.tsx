import { CourseDetailPage } from '@/components/learner-pages/course-detail-page';

export default async function LearnerCourseDetailPage({
  params,
}: {
  params: Promise<{ wsId: string; courseId: string }>;
}) {
  const { wsId, courseId } = await params;
  return <CourseDetailPage wsId={wsId} courseId={courseId} />;
}
