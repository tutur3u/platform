import WalletDetailsPage from '@tuturuuu/ui/finance/wallets/walletId/wallet-details-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

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
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const sp = await searchParams;

  return (
    <WalletDetailsPage
      wsId={workspace.id}
      walletId={walletId}
      searchParams={sp}
    />
  );
}
