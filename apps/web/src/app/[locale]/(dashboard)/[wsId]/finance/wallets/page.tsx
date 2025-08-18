import WalletsPage from '@tuturuuu/ui/finance/wallets/wallets-page';

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
  const { wsId } = await params;
  const sp = await searchParams;

  return (
    <WalletsPage wsId={wsId} searchParams={sp} />
  );
}

