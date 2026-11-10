import type { Metadata } from 'next';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { NotesClient } from './notes-client';

export const metadata: Metadata = {
  title: 'Notes',
  description: 'Write and organize notes across your devices.',
};

export default async function NotesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => <NotesClient wsId={wsId} />}
    </WorkspaceWrapper>
  );
}
