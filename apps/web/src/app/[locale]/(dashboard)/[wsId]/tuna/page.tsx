import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import TunaClient from './client';

export const metadata: Metadata = {
  title: 'Tuna',
  description:
    'Your personal AI companion. Chat, focus, and grow together with Tuna.',
};

export default async function TunaPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <WorkspaceWrapper params={params}>
      {({ wsId, isPersonal }) => (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <div className="h-32 w-32 animate-pulse rounded-full bg-gradient-to-br from-sky-200 to-blue-300" />
            </div>
          }
        >
          <TunaClient wsId={wsId} isPersonal={isPersonal} />
        </Suspense>
      )}
    </WorkspaceWrapper>
  );
}
