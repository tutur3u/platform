import { MindBoardIndex } from '@tuturuuu/mind-ui';
import { requireMindUser } from '@/lib/access';

export default async function MindWorkspacePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  await requireMindUser();

  return <MindBoardIndex workspaceSlug={wsId} wsId={wsId} />;
}
