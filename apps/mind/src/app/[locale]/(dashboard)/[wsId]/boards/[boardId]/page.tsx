import { MindDashboard } from '@tuturuuu/mind-ui/dashboard';
import { requireMindUser } from '@/lib/access';

export default async function MindBoardPage({
  params,
}: {
  params: Promise<{ boardId: string; wsId: string }>;
}) {
  const { boardId, wsId } = await params;
  await requireMindUser();

  return <MindDashboard initialBoardId={boardId} wsId={wsId} />;
}
