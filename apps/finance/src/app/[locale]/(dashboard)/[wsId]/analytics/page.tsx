import AnalyticsPage from '@tuturuuu/ui/finance/analytics/analytics-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceAnalyticsPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();

  return <AnalyticsPage wsId={workspace.id} />;
}
