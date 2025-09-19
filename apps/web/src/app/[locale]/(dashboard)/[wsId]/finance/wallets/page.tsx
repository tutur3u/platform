import WalletsPage from '@tuturuuu/ui/finance/wallets/wallets-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wallets',
  description: 'Manage Wallets in the Finance area of your Tuturuuu workspace.',
};


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
  const sp = await searchParams;
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  return <WalletsPage wsId={wsId} searchParams={sp} />;
}
