import RecurringTransactionsPage from '@tuturuuu/ui/finance/recurring/recurring-transactions-page';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    create?: string;
  }>;
}

export default async function WorkspaceRecurringPage({
  params,
  searchParams,
}: Props) {
  await connection();

  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();
  const sp = await searchParams;

  return (
    <RecurringTransactionsPage
      wsId={context.wsId}
      currency={context.currency}
      openCreateDialog={sp.create === 'recurring'}
    />
  );
}
