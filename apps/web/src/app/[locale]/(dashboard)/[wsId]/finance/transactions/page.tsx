import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import { notFound } from 'next/navigation';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionsPage({ params }: Props) {
  const { wsId: id } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
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
