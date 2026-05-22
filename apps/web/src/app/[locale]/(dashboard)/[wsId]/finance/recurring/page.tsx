import RecurringTransactionsPage from '@tuturuuu/ui/finance/recurring/recurring-transactions-page';
import { notFound } from 'next/navigation';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceRecurringPage({ params }: Props) {
  const { wsId: id } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context) notFound();

  return (
    <RecurringTransactionsPage
      wsId={context.wsId}
      currency={context.currency}
    />
  );
}
