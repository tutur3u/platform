import AnalyticsPage from '@tuturuuu/ui/finance/analytics/analytics-page';
import { notFound } from 'next/navigation';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceAnalyticsPage({ params }: Props) {
  const { wsId: id } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context) notFound();

  return <AnalyticsPage wsId={context.wsId} currency={context.currency} />;
}
