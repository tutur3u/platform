import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import WalletsPage from '@tuturuuu/ui/finance/wallets/wallets-page';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    create?: string;
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceWalletsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();
  const sp = await searchParams;
  const internalApiOptions = withForwardedInternalApiAuth(await headers());

  return (
    <WalletsPage
      wsId={context.wsId}
      searchParams={sp}
      currency={context.currency}
      financePrefix=""
      internalApiOptions={internalApiOptions}
      openCreateDialog={sp.create === 'wallet' || sp.create === 'credit-card'}
      page={sp.page}
      pageSize={sp.pageSize}
      permissions={context.permissions}
      workspace={context.workspace}
    />
  );
}
