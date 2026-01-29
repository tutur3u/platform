import RecurringTransactionsPage from '@tuturuuu/ui/finance/recurring/recurring-transactions-page';
import {
  getWorkspace,
  getWorkspaceConfig,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recurring Transactions',
  description:
    'Manage Recurring Transactions in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceRecurringTransactionsPage({
  params,
}: Props) {
  const { wsId: id } = await params;

  const [workspace, currency] = await Promise.all([
    getWorkspace(id),
    getWorkspaceConfig(id, 'DEFAULT_CURRENCY'),
  ]);
  const wsId = workspace.id;

  return <RecurringTransactionsPage wsId={wsId} currency={currency ?? 'USD'} />;
}
