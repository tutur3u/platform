import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';
import { getSecret, getSecrets, getWorkspace } from '@/lib/workspace-helper';
import StatisticCard from '@/components/cards/StatisticCard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getReportsCount } from '../users/reports/page';

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

  const secrets = await getSecrets(wsId, [
    'ENABLE_USERS',
    'ENABLE_INVENTORY',
    'ENABLE_FINANCE',
  ]);

  const verifySecret = (secret: string, value: string) =>
    getSecret(secret, secrets)?.value === value;

  const enableUsers = verifySecret('ENABLE_USERS', 'true');
  const enableInventory = verifySecret('ENABLE_INVENTORY', 'true');
  const enableFinance = verifySecret('ENABLE_FINANCE', 'true');

  const homeLabel = t('home');

  const { data: income } = enableFinance
    ? await supabase.rpc('get_workspace_wallets_income', {
        ws_id: wsId,
        start_date: null,
        end_date: null,
      })
    : { data: 0 };

  const { data: expense } = enableFinance
    ? await supabase.rpc('get_workspace_wallets_expense', {
        ws_id: wsId,
        start_date: null,
        end_date: null,
      })
    : { data: 0 };

  const { count: walletsCount } = enableFinance
    ? await supabase
        .from('workspace_wallets')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { count: categoriesCount } = enableFinance
    ? await supabase
        .from('transaction_categories')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { count: transactionsCount } = enableFinance
    ? await supabase
        .from('wallet_transactions')
        .select('*, workspace_wallets!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('workspace_wallets.ws_id', wsId)
    : { count: 0 };

  const { count: invoicesCount } = enableFinance
    ? await supabase
        .from('finance_invoices')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

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

  const { data: workspaceProducts } = enableInventory
    ? await supabase.rpc('get_workspace_products_count', {
        ws_id: wsId,
      })
    : { data: 0 };

  const { data: inventoryProducts } = enableInventory
    ? await supabase.rpc('get_inventory_products_count', {
        ws_id: wsId,
      })
    : { data: 0 };

  const { count: categories } = enableInventory
    ? await supabase
        .from('product_categories')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { count: batches } = enableInventory
    ? await supabase
        .from('inventory_batches')
        .select('*, inventory_warehouses!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('inventory_warehouses.ws_id', wsId)
    : { count: 0 };

  const { count: warehouses } = enableInventory
    ? await supabase
        .from('inventory_warehouses')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { count: units } = enableInventory
    ? await supabase
        .from('inventory_units')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { count: suppliers } = enableInventory
    ? await supabase
        .from('inventory_suppliers')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { count: promotions } = enableInventory
    ? await supabase
        .from('workspace_promotions')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { count: users } = enableUsers
    ? await supabase
        .from('workspace_users')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { count: userGroups } = enableUsers
    ? await supabase
        .from('workspace_user_groups')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const reports = enableUsers ? await getReportsCount(wsId) : 0;

  const usersLabel = t('sidebar-tabs:users');
  const sum = (income || 0) + (expense || 0);

  return (
    <>
      <div className="border-foreground/10 bg-foreground/5 rounded-lg border p-4">
        <h1 className="text-2xl font-bold">{homeLabel}</h1>
        <p className="text-zinc-700 dark:text-zinc-400">
          {t('description_p1')}{' '}
          <span className="font-semibold text-zinc-900 dark:text-zinc-200">
            {ws?.name || 'Unnamed Workspace'}
          </span>{' '}
          {t('description_p2')}
        </p>
      </div>

      {enableFinance && (
        <>
          <Separator className="my-4" />
          <div className="mb-2 text-2xl font-semibold">
            {t('sidebar-tabs:finance')}
          </div>
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatisticCard
              title={t('finance-overview:total-balance')}
              value={Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(sum || 0)}
              className="md:col-span-2"
            />

            <StatisticCard
              title={t('finance-overview:total-income')}
              value={Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
                signDisplay: 'exceptZero',
              }).format(income || 0)}
            />

            <StatisticCard
              title={t('finance-overview:total-expense')}
              value={Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
                signDisplay: 'exceptZero',
              }).format(expense || 0)}
            />

            <StatisticCard
              title={t('workspace-finance-tabs:wallets')}
              value={walletsCount}
              href={`/${wsId}/finance/wallets`}
            />

            <StatisticCard
              title={t('workspace-finance-tabs:categories')}
              value={categoriesCount}
              href={`/${wsId}/finance/transactions/categories`}
            />

            <StatisticCard
              title={t('workspace-finance-tabs:transactions')}
              value={transactionsCount}
              href={`/${wsId}/finance/transactions`}
            />

            <StatisticCard
              title={t('workspace-finance-tabs:invoices')}
              value={invoicesCount}
              href={`/${wsId}/finance/invoices`}
            />
          </div>
        </>
      )}

      {/* {(ws.preset === 'ALL' || ws.preset === 'PHARMACY') && (
        <>
          <Separator className="mb-8 mt-4" />
          <div className="mb-2 text-2xl font-semibold">
            {t('sidebar-tabs:healthcare')}
          </div>
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatisticCard
              title="Kiểm tra sức khoẻ"
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

      {enableInventory && (
        <>
          <Separator className="mb-8 mt-4" />
          <div className="mb-2 text-2xl font-semibold">
            {t('sidebar-tabs:inventory')}
          </div>
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatisticCard
              title={t('workspace-inventory-tabs:products')}
              value={workspaceProducts}
              href={`/${wsId}/inventory/products`}
            />

            <StatisticCard
              title={t('inventory-overview:products-with-prices')}
              value={inventoryProducts}
              href={`/${wsId}/inventory/products`}
            />

            <StatisticCard
              title={t('workspace-inventory-tabs:categories')}
              value={categories}
              href={`/${wsId}/inventory/categories`}
            />

            <StatisticCard
              title={t('workspace-inventory-tabs:batches')}
              value={batches}
              href={`/${wsId}/inventory/batches`}
            />

            <StatisticCard
              title={t('workspace-inventory-tabs:warehouses')}
              value={warehouses}
              href={`/${wsId}/inventory/warehouses`}
            />

            <StatisticCard
              title={t('workspace-inventory-tabs:units')}
              value={units}
              href={`/${wsId}/inventory/units`}
            />

            <StatisticCard
              title={t('workspace-inventory-tabs:suppliers')}
              value={suppliers}
              href={`/${wsId}/inventory/suppliers`}
            />

            <StatisticCard
              title={t('workspace-inventory-tabs:promotions')}
              value={promotions}
              href={`/${wsId}/inventory/promotions`}
            />
          </div>
        </>
      )}

      {enableUsers && (
        <>
          <Separator className="mb-8 mt-4" />
          <div className="mb-2 text-2xl font-semibold">
            {t('sidebar-tabs:users')}
          </div>
          <div className="grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatisticCard
              title={usersLabel}
              value={users}
              href={`/${wsId}/users/list`}
            />

            <StatisticCard
              title={t('workspace-users-tabs:groups')}
              value={userGroups}
              href={`/${wsId}/users/groups`}
            />

            <StatisticCard
              title={t('workspace-users-tabs:reports')}
              value={reports}
              href={`/${wsId}/users/reports`}
            />
          </div>
        </>
      )}
    </>
  );
}
