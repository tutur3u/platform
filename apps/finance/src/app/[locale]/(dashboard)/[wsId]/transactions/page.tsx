import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionsPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  return <TransactionsPage wsId={workspace.id} />;
}
