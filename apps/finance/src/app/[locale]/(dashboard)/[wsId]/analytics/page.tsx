import AnalyticsPage from '@tuturuuu/ui/finance/analytics/analytics-page';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceAnalyticsPage({ params }: Props) {
  await connection();

  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();

  return <AnalyticsPage wsId={context.wsId} currency={context.currency} />;
}
