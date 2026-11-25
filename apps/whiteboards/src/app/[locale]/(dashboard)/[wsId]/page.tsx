import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { WhiteboardsPageView } from '@/features/whiteboards/whiteboards-page-view';
import { getWhiteboardsWorkspace } from '@/lib/workspace';

export const metadata: Metadata = {
  title: 'Whiteboards',
  description: 'Manage Whiteboards in your Tuturuuu workspace.',
};

interface WhiteboardsPageProps {
  params: Promise<{ wsId: string }>;
}

export default async function WhiteboardsPage({
  params,
}: WhiteboardsPageProps) {
  await connection();

  const { wsId: id } = await params;
  const workspace = await getWhiteboardsWorkspace(id);
  if (!workspace) notFound();

  return <WhiteboardsPageView wsId={workspace.id} />;
}
