import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionsPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);

  return <TransactionsPage wsId={workspace.id} />;
}
