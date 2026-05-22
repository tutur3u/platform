import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import WalletDetailsPage from '@tuturuuu/ui/finance/wallets/walletId/wallet-details-page';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

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
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context) notFound();
  const sp = await searchParams;
  const internalApiOptions = withForwardedInternalApiAuth(await headers());

  return (
    <WalletDetailsPage
      wsId={context.wsId}
      walletId={walletId}
      searchParams={sp}
      defaultCurrency={context.currency}
      internalApiOptions={internalApiOptions}
      permissions={context.permissions}
      workspace={context.workspace}
    />
  );
}
