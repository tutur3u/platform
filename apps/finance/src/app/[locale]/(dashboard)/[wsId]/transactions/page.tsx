import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    create?: string;
  }>;
}

export default async function WorkspaceTransactionsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const sp = await searchParams;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();

  return (
    <TransactionsPage
      wsId={context.wsId}
      currency={context.currency}
      permissions={context.permissions}
      openCreateDialog={sp.create === 'transaction'}
      showTransactionTypeFilter
      workspace={context.workspace}
    />
  );
}
