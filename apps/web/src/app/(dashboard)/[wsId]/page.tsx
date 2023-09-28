import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';
import { getWorkspace } from '@/lib/workspace-helper';
import StatisticCard from '@/components/cards/StatisticCard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

interface Props {
  params: {
    wsId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceHomePage({ params: { wsId } }: Props) {
  const supabase = createServerComponentClient({ cookies });

  const { t } = useTranslation('ws-home');
  const ws = await getWorkspace(wsId);

  const homeLabel = t('workspace-tabs:home');

  const { data: income } = await supabase.rpc('get_workspace_wallets_income', {
    ws_id: wsId,
    start_date: null,
    end_date: null,
  });

  const { data: expense } = await supabase.rpc(
    'get_workspace_wallets_expense',
    {
      ws_id: wsId,
      start_date: null,
      end_date: null,
    }
  );

  const { count: walletsCount } = await supabase
    .from('workspace_wallets')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: categoriesCount } = await supabase
    .from('transaction_categories')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: transactionsCount } = await supabase
    .from('wallet_transactions')
    .select('*, workspace_wallets!inner(ws_id)', {
      count: 'exact',
      head: true,
    })
    .eq('workspace_wallets.ws_id', wsId);

  const { count: invoicesCount } = await supabase
    .from('finance_invoices')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const walletsLabel = t('finance-tabs:wallets');
  const transactionsLabel = t('finance-tabs:transactions');
  const categoriesLabel = t('finance-tabs:transaction-categories');
  const invoicesLabel = t('finance-tabs:invoices');

  const totalBalance = t('finance-overview:total-balance');
  const totalIncome = t('finance-overview:total-income');
  const totalExpense = t('finance-overview:total-expense');

  // const { count: checkups } = await supabase
  //   .from('healthcare_checkups')
  //   .select('*', {
  //     count: 'exact',
  //     head: true,
  //   })
  //   .eq('ws_id', wsId);

  // const { count: diagnoses } = await supabase
  //   .from('healthcare_diagnoses')
  //   .select('*', {
  //     count: 'exact',
  //     head: true,
  //   })
  //   .eq('ws_id', wsId);

  // const { count: vitals } = await supabase
  //   .from('healthcare_vitals')
  //   .select('*', {
  //     count: 'exact',
  //     head: true,
  //   })
  //   .eq('ws_id', wsId);

  // const { count: groups } = await supabase
  //   .from('healthcare_vital_groups')
  //   .select('*', {
  //     count: 'exact',
  //     head: true,
  //   })
  //   .eq('ws_id', wsId);

  const { data: workspaceProducts } = await supabase.rpc(
    'get_workspace_products_count',
    {
      ws_id: wsId,
    }
  );

  const { data: inventoryProducts } = await supabase.rpc(
    'get_inventory_products_count',
    {
      ws_id: wsId,
    }
  );

  const { count: categories } = await supabase
    .from('product_categories')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: batches } = await supabase
    .from('inventory_batches')
    .select('*, inventory_warehouses!inner(ws_id)', {
      count: 'exact',
      head: true,
    })
    .eq('inventory_warehouses.ws_id', wsId);

  const { count: warehouses } = await supabase
    .from('inventory_warehouses')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: units } = await supabase
    .from('inventory_units')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: suppliers } = await supabase
    .from('inventory_suppliers')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: promotions } = await supabase
    .from('workspace_promotions')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: users } = await supabase
    .from('workspace_users')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: userGroups } = await supabase
    .from('workspace_user_groups')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const usersLabel = t('sidebar-tabs:users');
  const sum = (income || 0) + (expense || 0);

  return (
    <>
      <div className="rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">{homeLabel}</h1>
        <p className="text-zinc-700 dark:text-zinc-400">
          {t('description_p1')}{' '}
          <span className="font-semibold text-zinc-900 dark:text-zinc-200">
            {ws?.name || 'Unnamed Workspace'}
          </span>{' '}
          {t('description_p2')}
        </p>
      </div>

      <Separator className="my-4" />
      <div className="mb-2 text-2xl font-semibold">
        {t('sidebar-tabs:finance')}
      </div>
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard
          title={totalBalance}
          color="blue"
          value={Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(sum || 0)}
          className="md:col-span-2"
        />

        <StatisticCard
          title={totalIncome}
          color="green"
          value={Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            signDisplay: 'exceptZero',
          }).format(income || 0)}
        />

        <StatisticCard
          title={totalExpense}
          color="red"
          value={Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            signDisplay: 'exceptZero',
          }).format(expense || 0)}
        />

        <StatisticCard
          title={walletsLabel}
          value={walletsCount}
          href={`/${wsId}/finance/wallets`}
        />

        <StatisticCard
          title={categoriesLabel}
          value={categoriesCount}
          href={`/${wsId}/finance/transactions/categories`}
        />

        <StatisticCard
          title={transactionsLabel}
          value={transactionsCount}
          href={`/${wsId}/finance/transactions`}
        />

        <StatisticCard
          title={invoicesLabel}
          value={invoicesCount}
          href={`/${wsId}/finance/invoices`}
        />
      </div>

      {/* {(ws.preset === 'ALL' || ws.preset === 'PHARMACY') && (
        <>
          <Separator className="mb-8 mt-4" />
          <div className="mb-2 text-2xl font-semibold">
            {t('sidebar-tabs:healthcare')}
          </div>
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatisticCard
              title="Kiểm tra sức khoẻ"
              color="blue"
              value={checkups}
              href={`/${wsId}/healthcare/checkups`}
            />

            <StatisticCard
              title="Chẩn đoán"
              value={diagnoses}
              href={`/${wsId}/healthcare/diagnoses`}
            />

            <StatisticCard
              title="Chỉ số"
              value={vitals}
              href={`/${wsId}/healthcare/vitals`}
            />

            <StatisticCard
              title="Nhóm chỉ số"
              value={groups}
              href={`/${wsId}/healthcare/vital-groups`}
            />
          </div>
        </>
      )} */}

      <Separator className="mb-8 mt-4" />
      <div className="mb-2 text-2xl font-semibold">
        {t('sidebar-tabs:inventory')}
      </div>
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard
          title={t('inventory-tabs:products')}
          value={workspaceProducts}
          href={`/${wsId}/inventory/products`}
        />

        <StatisticCard
          title={t('inventory-overview:products-with-prices')}
          value={inventoryProducts}
          href={`/${wsId}/inventory/products`}
        />

        <StatisticCard
          title={t('inventory-tabs:product-categories')}
          value={categories}
          href={`/${wsId}/inventory/categories`}
        />

        <StatisticCard
          title={t('inventory-tabs:batches')}
          value={batches}
          href={`/${wsId}/inventory/batches`}
        />

        <StatisticCard
          title={t('inventory-tabs:warehouses')}
          value={warehouses}
          href={`/${wsId}/inventory/warehouses`}
        />

        <StatisticCard
          title={t('inventory-tabs:units')}
          value={units}
          href={`/${wsId}/inventory/units`}
        />

        <StatisticCard
          title={t('inventory-tabs:suppliers')}
          value={suppliers}
          href={`/${wsId}/inventory/suppliers`}
        />

        <StatisticCard
          title={t('inventory-tabs:promotions')}
          value={promotions}
          href={`/${wsId}/inventory/promotions`}
        />
      </div>

      <Separator className="mb-8 mt-4" />
      <div className="mb-2 text-2xl font-semibold">
        {t('sidebar-tabs:users')}
      </div>
      <div className="grid items-end gap-4 md:grid-cols-2">
        <StatisticCard
          title={usersLabel}
          color="blue"
          value={users}
          href={`/${wsId}/users/list`}
        />

        <StatisticCard
          title={t('workspace-users-tabs:groups')}
          color="green"
          value={userGroups}
          href={`/${wsId}/users/groups`}
        />
      </div>
    </>
  );
}
