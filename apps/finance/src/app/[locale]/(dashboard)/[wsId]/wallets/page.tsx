import WalletsPage from '@tuturuuu/ui/finance/wallets/wallets-page';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    create?: string;
    q?: string;
    tool?: string;
  }>;
}

export default async function WorkspaceWalletsPage({
  params,
  searchParams,
}: Props) {
  await connection();

  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();
  const sp = await searchParams;

  return (
    <WalletsPage
      wsId={context.wsId}
      searchParams={sp}
      currency={context.currency}
      financePrefix=""
      openCreateDialog={sp.create === 'wallet' || sp.create === 'credit-card'}
      permissions={context.permissions}
      workspace={context.workspace}
    />
  );
}
