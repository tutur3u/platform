import WalletDetailsPage from '@tuturuuu/ui/finance/wallets/walletId/wallet-details-page';

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
  const { wsId, walletId } = await params;
  const sp = await searchParams;

  return (
    <WalletDetailsPage wsId={wsId} walletId={walletId} searchParams={sp} />
  );
}
