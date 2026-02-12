import TransactionDetailsPage from '@tuturuuu/ui/finance/transactions/transactionId/transaction-details-page';
import { Suspense } from 'react';

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
    <Suspense>
      <TransactionDetailsPage params={params} />
    </Suspense>
  );
}
