import { requireFeatureFlags } from '@tuturuuu/utils/feature-flags/core';
import type { ReactNode } from 'react';

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
  await requireFeatureFlags(wsId, {
    requiredFlags: ['ENABLE_CHALLENGES'],
    redirectTo: `/${wsId}/home`,
  });

  return <>{children}</>;
}
