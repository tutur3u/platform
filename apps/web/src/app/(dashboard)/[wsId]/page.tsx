import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '../../../components/cards/StatisticCard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { Workspace } from '@/types/primitives/Workspace';
import { API_URL } from '@/constants/common';

interface Props {
  params: {
    wsId: string | null;
  };
}

export default async function WorkspaceHomePage({ params: { wsId } }: Props) {
  const { t } = useTranslation('ws-home');

  const ws = await getWorkspace(wsId);

  const homeLabel = t('workspace-tabs:home');

  const incomeApi = `${API_URL}/workspaces/${wsId}/finance/wallets/income`;
  const expenseApi = `${API_URL}/workspaces/${wsId}/finance/wallets/expense`;
  const walletsCountApi = `${API_URL}/workspaces/${wsId}/finance/wallets/count`;
  const categoriesCountApi = `${API_URL}/workspaces/${wsId}/finance/transactions/categories/count`;
  const transactionsCountApi = `${API_URL}/workspaces/${wsId}/finance/transactions/count`;
  const invoicesCountApi = `${API_URL}/workspaces/${wsId}/finance/invoices/count`;

  const { data: income } = await fetch(incomeApi).then((res) => res.json());
  const { data: expense } = await fetch(expenseApi).then((res) => res.json());
  const { data: walletsCount } = await fetch(walletsCountApi).then((res) =>
    res.json()
  );
  const { data: categoriesCount } = await fetch(categoriesCountApi).then(
    (res) => res.json()
  );
  const { data: transactionsCount } = await fetch(transactionsCountApi).then(
    (res) => res.json()
  );
  const { data: invoicesCount } = await fetch(invoicesCountApi).then((res) =>
    res.json()
  );

  const walletsLabel = t('finance-tabs:wallets');
  const transactionsLabel = t('finance-tabs:transactions');
  const categoriesLabel = t('finance-tabs:transaction-categories');
  const invoicesLabel = t('finance-tabs:invoices');

  const totalBalance = t('finance-overview:total-balance');
  const totalIncome = t('finance-overview:total-income');
  const totalExpense = t('finance-overview:total-expense');

  const checkupsCountApi = `${API_URL}/workspaces/${wsId}/healthcare/checkups/count`;
  const diagnosesCountApi = `${API_URL}/workspaces/${wsId}/healthcare/diagnoses/count`;
  const vitalsCountApi = `${API_URL}/workspaces/${wsId}/healthcare/vitals/count`;
  const groupsCountApi = `${API_URL}/workspaces/${wsId}/healthcare/vital-groups/count`;

  const { data: checkups } = await fetch(checkupsCountApi).then((res) =>
    res.json()
  );

  const { data: diagnoses } = await fetch(diagnosesCountApi).then((res) =>
    res.json()
  );

  const { data: vitals } = await fetch(vitalsCountApi).then((res) =>
    res.json()
  );

  const { data: groups } = await fetch(groupsCountApi).then((res) =>
    res.json()
  );

  const productsCountApi = `${API_URL}/workspaces/${wsId}/inventory/products/count`;
  const productCategoriesCountApi = `${API_URL}/workspaces/${wsId}/inventory/categories/count`;
  const batchesCountApi = `${API_URL}/workspaces/${wsId}/inventory/batches/count`;
  const warehousesCountApi = `${API_URL}/workspaces/${wsId}/inventory/warehouses/count`;
  const unitsCountApi = `${API_URL}/workspaces/${wsId}/inventory/units/count`;
  const suppliersCountApi = `${API_URL}/workspaces/${wsId}/inventory/suppliers/count`;

  const { data: products } = await fetch(productsCountApi).then((res) => {
    return res.json();
  });

  console.log(products);

  const { data: categories } = await fetch(productCategoriesCountApi).then(
    (res) => res.json()
  );

  const { data: batches } = await fetch(batchesCountApi).then((res) =>
    res.json()
  );

  const { data: warehouses } = await fetch(warehousesCountApi).then((res) =>
    res.json()
  );

  const { data: units } = await fetch(unitsCountApi).then((res) => res.json());

  const { data: suppliers } = await fetch(suppliersCountApi).then((res) =>
    res.json()
  );

  const usersCountApi = `${API_URL}/workspaces/${wsId}/users/count`;
  const userGroupsCountApi = `${API_URL}/workspaces/${wsId}/users/groups/count`;

  const { data: users } = await fetch(usersCountApi).then((res) => res.json());

  const { data: userGroups } = await fetch(userGroupsCountApi).then((res) =>
    res.json()
  );

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

      {(ws.preset === 'ALL' || ws.preset === 'PHARMACY') && (
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
      )}

      <Separator className="mb-8 mt-4" />
      <div className="mb-2 text-2xl font-semibold">
        {t('sidebar-tabs:inventory')}
      </div>
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard
          title={t('inventory-tabs:products')}
          color="blue"
          value={products?.ws}
          href={`/${wsId}/inventory/products`}
          className="md:col-span-2"
        />

        <StatisticCard
          title={t('inventory-overview:products-with-prices')}
          value={products?.inventory}
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

async function getWorkspace(id?: string | null) {
  if (!id) notFound();

  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, preset, created_at, workspace_members!inner(role)')
    .eq('id', id)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (error) notFound();
  if (!data?.workspace_members[0]?.role) notFound();

  const ws = {
    ...data,
    role: data.workspace_members[0].role,
  };

  return ws as Workspace;
}
