import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Transactions',
  description:
    'Manage Transactions in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => <TransactionsPage wsId={wsId} />}
    </WorkspaceWrapper>
  );
}
