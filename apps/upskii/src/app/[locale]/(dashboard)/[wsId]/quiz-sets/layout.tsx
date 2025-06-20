import { getFeatureFlag } from '@/constants/secrets';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

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

  // Check if quizzes feature is enabled
  const ENABLE_QUIZZES = await getFeatureFlag(wsId, 'ENABLE_QUIZZES');

  if (!ENABLE_QUIZZES) {
    redirect(`/${wsId}/home`);
  }

  return <>{children}</>;
}
