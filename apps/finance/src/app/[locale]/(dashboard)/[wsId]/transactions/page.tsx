import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionsPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();

  return <TransactionsPage wsId={workspace.id} />;
}
