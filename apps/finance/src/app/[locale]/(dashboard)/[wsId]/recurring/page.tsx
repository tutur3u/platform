import RecurringTransactionsPage from '@tuturuuu/ui/finance/recurring/recurring-transactions-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceRecurringPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);

  return <RecurringTransactionsPage wsId={workspace.id} />;
}
