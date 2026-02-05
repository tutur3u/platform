import { createClient } from '@tuturuuu/supabase/next/server';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import { WalletsDataTable } from '@tuturuuu/ui/finance/wallets/wallets-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import {
  getPermissions,
  getWorkspace,
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
  page?: string;
  pageSize?: string;
}

export default async function WalletsPage({
  wsId,
  searchParams,
  page,
  pageSize,
}: Props) {
  const [t, { containsPermission }, currency, workspace] = await Promise.all([
    getTranslations(),
    getPermissions({ wsId }),
    getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
    getWorkspace(wsId),
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
      <WalletsDataTable
        wsId={wsId}
        data={data}
        count={count}
        canUpdateWallets={canUpdateWallets}
        canDeleteWallets={canDeleteWallets}
        currency={currency ?? 'USD'}
        isPersonalWorkspace={workspace?.personal}
        page={page}
        pageSize={pageSize}
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
    .select('*, credit_wallets(limit, statement_date, payment_date)', {
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

  // Flatten credit_wallets join data onto wallet objects
  const flatData = (data || []).map(
    ({
      credit_wallets,
      ...wallet
    }: {
      credit_wallets?: {
        limit: number;
        statement_date: number;
        payment_date: number;
      } | null;
    } & Record<string, unknown>) => ({
      ...wallet,
      ...(credit_wallets
        ? {
            limit: credit_wallets.limit,
            statement_date: credit_wallets.statement_date,
            payment_date: credit_wallets.payment_date,
          }
        : {}),
    })
  );

  return { data: flatData, count } as { data: Wallet[]; count: number };
}
