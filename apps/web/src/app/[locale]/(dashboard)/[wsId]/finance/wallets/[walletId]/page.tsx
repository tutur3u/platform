import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../../redirect';

export const metadata: Metadata = {
  title: 'Wallet Details',
  description:
    'View wallet details in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    walletId: string;
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceWalletDetailsPage({
  params,
  searchParams,
}: Props) {
  const { walletId, wsId } = await params;

  return redirectToFinanceApp({
    params: Promise.resolve({ wsId }),
    path: `wallets/${walletId}`,
    searchParams,
  });
}
