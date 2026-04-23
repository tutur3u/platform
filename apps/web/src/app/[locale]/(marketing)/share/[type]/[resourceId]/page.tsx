import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadSharedCourseContent } from '@/lib/share/load-shared-course';
import { CourseViewer } from './course-viewer';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{
    type: string;
    resourceId: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;

  if (type !== 'course') {
    return { title: 'Shared Content' };
  }

  return {
    title: 'Course Content',
    description: 'View shared course content.',
  };
}

export default async function SharePage({ params }: Props) {
  const { type, resourceId } = await params;

  // Only support 'course' type for now
  if (type !== 'course') notFound();

  const sharedCourse = await loadSharedCourseContent(resourceId);
  if (!sharedCourse) notFound();

  return (
    <CourseViewer
      group={sharedCourse.group}
      modules={sharedCourse.modules}
      resourceId={resourceId}
    />
  );
}
