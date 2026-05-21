import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import TransactionDetailsPage from '@tuturuuu/ui/finance/transactions/transactionId/transaction-details-page';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

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
  const { locale, transactionId, wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();
  const internalApiOptions = withForwardedInternalApiAuth(await headers());

  return (
    <Suspense>
      <TransactionDetailsPage
        params={Promise.resolve({
          locale,
          transactionId,
          wsId: context.wsId,
        })}
        internalApiOptions={internalApiOptions}
      />
    </Suspense>
  );
}
