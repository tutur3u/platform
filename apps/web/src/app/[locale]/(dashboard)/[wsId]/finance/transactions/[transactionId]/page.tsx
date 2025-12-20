import TransactionDetailsPage from '@tuturuuu/ui/finance/transactions/transactionId/transaction-details-page';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Transaction Details',
  description:
    'Manage Transaction Details in the Transactions area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    transactionId: string;
    locale: string;
  }>;
}

export default async function WorkspaceTransactionDetailsPage({
  params,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {() => <TransactionDetailsPage params={params} />}
    </WorkspaceWrapper>
  );
}
