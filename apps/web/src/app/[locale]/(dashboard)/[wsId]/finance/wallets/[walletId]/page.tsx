import WalletDetailsPage from '@tuturuuu/ui/finance/wallets/walletId/wallet-details-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wallet Details',
  description:
    'Manage Wallet Details in the Wallets area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    walletId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceWalletDetailsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id, walletId } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  return (
    <WalletDetailsPage wsId={wsId} walletId={walletId} searchParams={sp} />
  );
}
