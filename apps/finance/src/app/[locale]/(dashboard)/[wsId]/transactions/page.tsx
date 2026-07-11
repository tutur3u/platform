import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    create?: string;
    mode?: string;
  }>;
}

export default async function WorkspaceTransactionsPage({
  params,
  searchParams,
}: Props) {
  await connection();

  const { wsId: id } = await params;
  const sp = await searchParams;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();

  return (
    <TransactionsPage
      wsId={context.wsId}
      currency={context.currency}
      permissions={context.permissions}
      permissionRequestUser={context.user}
      openCreateDialog={sp.create === 'transaction' || sp.create === 'transfer'}
      initialCreateMode={
        sp.create === 'transfer' || sp.mode === 'transfer'
          ? 'transfer'
          : 'transaction'
      }
      showTransactionTypeFilter
      workspace={context.workspace}
    />
  );
}
