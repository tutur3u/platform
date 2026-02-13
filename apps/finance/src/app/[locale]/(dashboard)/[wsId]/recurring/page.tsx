import RecurringTransactionsPage from '@tuturuuu/ui/finance/recurring/recurring-transactions-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceRecurringPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  return <RecurringTransactionsPage wsId={workspace.id} />;
}
