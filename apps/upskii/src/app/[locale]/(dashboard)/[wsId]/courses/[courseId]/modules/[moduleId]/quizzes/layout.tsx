import { requireFeatureFlags } from '@tuturuuu/utils/feature-flags/core';
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleQuizzesLayout({
  children,
  params,
}: LayoutProps) {
  const { wsId, courseId, moduleId } = await params;

  await requireFeatureFlags(wsId, {
    requiredFlags: ['ENABLE_QUIZZES'],
    redirectTo: `/${wsId}/courses/${courseId}/modules/${moduleId}`,
  });

  return <>{children}</>;
}
