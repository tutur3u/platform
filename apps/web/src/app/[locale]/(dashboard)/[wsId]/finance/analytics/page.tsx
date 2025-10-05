import AnalyticsPage from '@tuturuuu/ui/finance/analytics/analytics-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Analytics',
  description: 'View analytics in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceAnalyticsPage({ params }: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  return <AnalyticsPage wsId={wsId} />;
}
