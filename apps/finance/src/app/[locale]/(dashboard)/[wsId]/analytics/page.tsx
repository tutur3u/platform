import AnalyticsPage from '@tuturuuu/ui/finance/analytics/analytics-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceAnalyticsPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);

  return <AnalyticsPage wsId={workspace.id} />;
}
