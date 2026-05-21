import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionsPage({ params }: Props) {
  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();

  return (
    <TransactionsPage
      wsId={context.wsId}
      currency={context.currency}
      permissions={context.permissions}
      showTransactionTypeFilter
      workspace={context.workspace}
    />
  );
}
