import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../../redirect';

export const metadata: Metadata = {
  title: 'Transaction Details',
  description:
    'View transaction details in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    transactionId: string;
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceTransactionDetailsPage({
  params,
  searchParams,
}: Props) {
  const { transactionId, wsId } = await params;

  return redirectToFinanceApp({
    params: Promise.resolve({ wsId }),
    path: `transactions/${transactionId}`,
    searchParams,
  });
}
