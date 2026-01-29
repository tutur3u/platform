import { createClient } from '@tuturuuu/supabase/next/server';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { walletColumns } from '@tuturuuu/ui/finance/wallets/columns';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import { Separator } from '@tuturuuu/ui/separator';
import {
  getPermissions,
  getWorkspaceConfig,
} from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

interface Props {
  wsId: string;
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
  };
}

export default async function WalletsPage({ wsId, searchParams }: Props) {
  const [t, { containsPermission }, currency] = await Promise.all([
    getTranslations(),
    getPermissions({ wsId }),
    getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
  ]);

  const canCreateWallets = containsPermission('create_wallets');
  const canUpdateWallets = containsPermission('update_wallets');
  const canDeleteWallets = containsPermission('delete_wallets');
  const hasManageFinance = containsPermission('manage_finance');

  const { data: rawData, count } = await getData(
    wsId,
    searchParams,
    hasManageFinance
  );

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
        form={canCreateWallets ? <WalletForm wsId={wsId} /> : undefined}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        columnGenerator={walletColumns}
        namespace="wallet-data-table"
        count={count}
        extraData={{
          canUpdateWallets,
          canDeleteWallets,
          currency: currency ?? 'USD',
        }}
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

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string },
  hasManageFinance: boolean
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_wallets')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

  if (!hasManageFinance) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: [], count: 0 };
    }

    // Get whitelisted wallet IDs by joining role members and role wallet whitelist
    const { data: whitelistData } = await supabase
      .from('workspace_role_wallet_whitelist')
      .select(
        'wallet_id, workspace_roles!inner(workspace_role_members!inner(user_id))'
      )
      .eq('workspace_roles.ws_id', wsId)
      .eq('workspace_roles.workspace_role_members.user_id', user.id);

    const whitelistedWalletIds = (whitelistData || []).map(
      (item) => item.wallet_id
    );

    if (whitelistedWalletIds.length > 0) {
      queryBuilder.in('id', whitelistedWalletIds);
    } else {
      // No whitelisted wallets or roles, return empty result
      return { data: [], count: 0 };
    }
  }

  queryBuilder.order('name', { ascending: true });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: Wallet[]; count: number };
}
