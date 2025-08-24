import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceTransactionsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const sp = await searchParams;

  return <TransactionsPage wsId={wsId} searchParams={sp} />;
}
