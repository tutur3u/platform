import { createClient } from '@tuturuuu/supabase/next/server';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { transactionColumns } from '@tuturuuu/ui/finance/transactions/columns';
import ExportDialogContent from '@tuturuuu/ui/finance/transactions/export-dialog-content';
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';
import { UserFilterWrapper } from '@tuturuuu/ui/finance/transactions/user-filter-wrapper';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

interface Props {
  wsId: string;
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
    userIds?: string | string[];
  };
}

export default async function TransactionsPage({ wsId, searchParams }: Props) {
  const { data: rawData, count } = await getData(wsId, searchParams);
  const t = await getTranslations();

  const { containsPermission } = await getPermissions({
    wsId,
  });

  const data = rawData.map((d) => ({
    ...d,
    href: `/${wsId}/finance/transactions/${d.id}`,
    ws_id: wsId,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-transactions.plural')}
        singularTitle={t('ws-transactions.singular')}
        description={t('ws-transactions.description')}
        createTitle={t('ws-transactions.create')}
        createDescription={t('ws-transactions.create_description')}
        form={<TransactionForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        columnGenerator={transactionColumns}
        filters={[<UserFilterWrapper key="user-filter" wsId={wsId} />]}
        toolbarExportContent={
          containsPermission('export_finance_data') && (
            <ExportDialogContent
              wsId={wsId}
              exportType="transactions"
              searchParams={searchParams}
            />
          )
        }
        namespace="transaction-data-table"
        count={count}
        defaultVisibility={{
          id: false,
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
    userIds,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    userIds?: string | string[];
  }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('wallet_transactions')
    .select(
      `*, workspace_wallets!inner(name, ws_id), transaction_categories(name),       workspace_users!wallet_transactions_creator_id_fkey(
        id,
        full_name,
        avatar_url,
        email
      )`,
      {
        count: 'exact',
      }
    )
    .eq('workspace_wallets.ws_id', wsId)
    .order('taken_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('description', `%${q}%`);

  // Filter by user IDs if provided
  if (userIds) {
    const userIdArray = Array.isArray(userIds) ? userIds : [userIds];
    if (userIdArray.length > 0) {
      queryBuilder.in('creator_id', userIdArray);
    }
  }

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(
    ({
      workspace_wallets,
      transaction_categories,
      workspace_users,
      ...rest
    }) => ({
      ...rest,
      wallet: workspace_wallets?.name,
      category: transaction_categories?.name,
      user: {
        full_name: workspace_users?.full_name ?? '',
        email: workspace_users?.email ?? '',
        avatar_url: workspace_users?.avatar_url ?? '',
      },
    })
  );

  return { data, count } as {
    data: Transaction[];
    count: number;
  };
}
