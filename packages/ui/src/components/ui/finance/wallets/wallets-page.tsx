import {
  listWallets,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
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
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
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
  financePrefix?: string;
}

export default async function WalletsPage({
  wsId,
  searchParams,
  page,
  pageSize,
  financePrefix = '/finance',
}: Props) {
  const [t, permissions, currency, workspace] = await Promise.all([
    getTranslations(),
    getPermissions({ wsId }),
    getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
    getWorkspace(wsId),
  ]);
  if (!permissions || !workspace) notFound();
  const { containsPermission } = permissions;

  const canCreateWallets = containsPermission('create_wallets');
  const canUpdateWallets = containsPermission('update_wallets');
  const canDeleteWallets = containsPermission('delete_wallets');
  const requestHeaders = await headers();
  const internalApiOptions = withForwardedInternalApiAuth(requestHeaders);
  const { data: rawData, count } = await getData(
    wsId,
    searchParams,
    internalApiOptions
  );

  const data = rawData.map((d) => ({
    ...d,
    href: `/${wsId}${financePrefix}/wallets/${d.id}`,
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
  internalApiOptions: Parameters<typeof listWallets>[1]
) {
  const wallets = await listWallets(wsId, internalApiOptions);
  const normalizedQuery = q?.trim().toLowerCase();
  const filteredWallets = wallets
    .filter((wallet) =>
      normalizedQuery
        ? wallet.name?.toLowerCase().includes(normalizedQuery)
        : true
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const parsedPage = parseInt(page, 10);
  const parsedPageSize = parseInt(pageSize, 10);
  const start = (parsedPage - 1) * parsedPageSize;

  return {
    data: filteredWallets.slice(start, start + parsedPageSize) as Wallet[],
    count: filteredWallets.length,
  };
}
