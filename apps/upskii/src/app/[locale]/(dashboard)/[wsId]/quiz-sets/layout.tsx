import { requireFeatureFlags } from '@tuturuuu/utils/feature-flags/core';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function QuizSetsLayout({
  children,
  params,
}: LayoutProps) {
  const { wsId } = await params;

  await requireFeatureFlags(wsId, {
    requiredFlags: ['ENABLE_QUIZZES'],
    redirectTo: `/${wsId}/home`,
  });

  return <>{children}</>;
}
