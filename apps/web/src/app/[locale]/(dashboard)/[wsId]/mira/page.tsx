import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import MiraClient from './client';

export const metadata: Metadata = {
  title: 'Mira',
  description:
    'Your personal AI companion. Chat, focus, and grow together with Mira.',
};

export default async function MiraPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();

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
          <MiraClient wsId={wsId} isPersonal={isPersonal} />
        </Suspense>
      )}
    </WorkspaceWrapper>
  );
}
