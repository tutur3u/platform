import RecurringTransactionsPage from '@tuturuuu/ui/finance/recurring/recurring-transactions-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceRecurringPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();

  return <RecurringTransactionsPage wsId={workspace.id} />;
}
