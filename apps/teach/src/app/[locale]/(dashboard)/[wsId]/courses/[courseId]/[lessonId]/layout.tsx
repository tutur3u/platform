import type { ReactNode } from 'react';
import CourseLessonShell from './course-lesson-shell';

export default async function CourseLessonLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{
    lessonId: string;
    wsId: string;
  }>;
}) {
  const { lessonId, wsId } = await params;

  return (
    <CourseLessonShell lessonId={lessonId} wsId={wsId}>
      {children}
    </CourseLessonShell>
  );
}
