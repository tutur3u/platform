import WalletsPage from '@tuturuuu/ui/finance/wallets/wallets-page';
import { notFound } from 'next/navigation';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    create?: string;
    q?: string;
  }>;
}

export default async function WorkspaceWalletsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context) notFound();
  const sp = await searchParams;

  return (
    <WalletsPage
      wsId={context.wsId}
      searchParams={sp}
      currency={context.currency}
      financePrefix="/finance"
      openCreateDialog={sp.create === 'wallet' || sp.create === 'credit-card'}
      permissions={context.permissions}
      workspace={context.workspace}
    />
  );
}
