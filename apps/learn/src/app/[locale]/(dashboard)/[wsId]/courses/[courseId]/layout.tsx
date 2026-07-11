import type { ReactNode } from 'react';
import CourseVocabularyShell from './course-vocabulary-shell';

export default async function LearnCourseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{
    courseId: string;
    wsId: string;
  }>;
}) {
  const { courseId, wsId } = await params;

  return (
    <CourseVocabularyShell courseId={courseId} wsId={wsId}>
      {children}
    </CourseVocabularyShell>
  );
}
