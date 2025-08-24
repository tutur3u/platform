import WalletDetailsPage from '@tuturuuu/ui/finance/wallets/walletId/wallet-details-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

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
  const { wsId: id, walletId, locale } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  return (
    <WalletDetailsPage
      wsId={wsId}
      walletId={walletId}
      locale={locale}
      searchParams={sp}
    />
  );
}
