import WalletsPage from '@tuturuuu/ui/finance/wallets/wallets-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
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
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();
  const sp = await searchParams;

  return <WalletsPage wsId={workspace.id} searchParams={sp} financePrefix="" />;
}
