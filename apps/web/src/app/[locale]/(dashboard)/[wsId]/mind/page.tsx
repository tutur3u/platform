import { MindBoardIndex } from '@tuturuuu/mind-ui';
import { notFound } from 'next/navigation';
import { getWebMindWorkspaceContext } from '@/lib/mind-workspace-context';

export default async function MindPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const context = await getWebMindWorkspaceContext(wsId);

  if (!context) {
    notFound();
  }

  return (
    <MindBoardIndex
      mindPrefix="/mind"
      workspaceSlug={wsId}
      wsId={context.wsId}
    />
  );
}
