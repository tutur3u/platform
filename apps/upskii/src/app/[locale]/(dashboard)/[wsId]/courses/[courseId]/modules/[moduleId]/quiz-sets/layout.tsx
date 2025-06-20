import { getFeatureFlag } from '@/constants/secrets';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleQuizSetsLayout({
  children,
  params,
}: LayoutProps) {
  const { wsId, courseId, moduleId } = await params;

  // Check if quizzes feature is enabled
  const ENABLE_QUIZZES = await getFeatureFlag(wsId, 'ENABLE_QUIZZES');

  if (!ENABLE_QUIZZES) {
    redirect(`/${wsId}/courses/${courseId}/modules/${moduleId}`);
  }

  return <>{children}</>;
}
