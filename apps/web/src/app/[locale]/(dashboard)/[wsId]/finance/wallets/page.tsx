import WalletsPage from '@tuturuuu/ui/finance/wallets/wallets-page';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

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
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const sp = await searchParams;
        return (
          <WalletsPage
            wsId={wsId}
            searchParams={sp}
            page={sp.page}
            pageSize={sp.pageSize}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
