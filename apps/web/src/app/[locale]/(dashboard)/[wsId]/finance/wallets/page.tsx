import { createClient } from '@tuturuuu/supabase/next/server';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { walletColumns } from './columns';
import { WalletForm } from './form';

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
  const t = await getTranslations();
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  const { page = '1', pageSize = '10' } = await searchParams;
  const parsedPage = Number.parseInt(page, 10);
  const parsedSize = Number.parseInt(pageSize, 10);
  const start = (parsedPage - 1) * parsedSize;
  const end = start + parsedSize - 1;

  const { data: rawData, count } = await getData(wsId, start, end);

  const data = rawData.map((d) => ({
    ...d,
    href: `/${wsId}/finance/wallets/${d.id}`,
    ws_id: wsId,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-wallets.plural')}
        singularTitle={t('ws-wallets.singular')}
        description={t('ws-wallets.description')}
        createTitle={t('ws-wallets.create')}
        createDescription={t('ws-wallets.create_description')}
        form={<WalletForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        columnGenerator={walletColumns}
        namespace="wallet-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          description: false,
          type: false,
          currency: false,
          report_opt_in: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getData(wsId: string, start: number, end: number) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_wallets')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  queryBuilder.range(start, end);

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: Wallet[]; count: number };
}
