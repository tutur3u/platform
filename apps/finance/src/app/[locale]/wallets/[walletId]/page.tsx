import WalletDetailsPage from '@tuturuuu/ui/finance/wallets/walletId/wallet-details-page';

interface Props {
  params: Promise<{
    wsId: string;
    walletId: string;
    locale: string;
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
  const { wsId, walletId, locale } = await params;
  const sp = await searchParams;

  return (
    <WalletDetailsPage
      wsId={wsId}
      walletId={walletId}
      locale={locale}
      searchParams={sp}
    />
  );
}
