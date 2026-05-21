import RecurringTransactionsPage from '@tuturuuu/ui/finance/recurring/recurring-transactions-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceRecurringPage({ params }: Props) {
  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();

  return (
    <RecurringTransactionsPage
      wsId={context.wsId}
      currency={context.currency}
    />
  );
}
