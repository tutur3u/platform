import { MindDashboard } from '@tuturuuu/mind-ui/dashboard';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getWebMindWorkspaceContext } from '@/lib/mind-workspace-context';

export const metadata: Metadata = {
  title: 'Mind Board',
  description: 'Open a Mind board inside your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    boardId: string;
    locale: string;
    wsId: string;
  }>;
}

export default async function MindBoardPage({ params }: PageProps) {
  const { boardId, wsId } = await params;
  const context = await getWebMindWorkspaceContext(wsId);

  if (!context) notFound();

  return (
    <MindDashboard
      initialBoardId={boardId}
      mindPrefix="/mind"
      workspaceSlug={wsId}
      wsId={context.wsId}
    />
  );
}
