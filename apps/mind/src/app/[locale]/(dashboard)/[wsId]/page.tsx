import { MindDashboard } from '@/components/mind/mind-dashboard';
import { requireMindUser } from '@/lib/access';

export default async function MindWorkspacePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  await requireMindUser();

  return <MindDashboard wsId={wsId} />;
}
