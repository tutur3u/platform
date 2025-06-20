import { getFeatureFlag } from '@/constants/secrets';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function ChallengesLayout({
  children,
  params,
}: LayoutProps) {
  const { wsId } = await params;

  // Check if challenges feature is enabled
  const ENABLE_CHALLENGES = await getFeatureFlag(wsId, 'ENABLE_CHALLENGES');

  if (!ENABLE_CHALLENGES) {
    redirect(`/${wsId}/home`);
  }

  return <>{children}</>;
}
