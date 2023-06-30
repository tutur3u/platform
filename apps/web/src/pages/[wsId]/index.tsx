import { ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import NestedLayout from '../../components/layouts/NestedLayout';
import HeaderX from '../../components/metadata/HeaderX';
import { Divider } from '@mantine/core';
import { enforceHasWorkspaces } from '../../utils/serverless/enforce-has-workspaces';
import { useSegments } from '../../hooks/useSegments';
import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '../../components/cards/StatisticCard';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { DateRange } from '../../utils/date-helper';
import moment from 'moment';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceHomePage = () => {
  const { t } = useTranslation('ws-home');
  const { ws } = useWorkspaces();

  const loadingLabel = t('common:loading');
  const homeLabel = t('workspace-tabs:home');

  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name ?? loadingLabel,
              href: `/${ws?.id}`,
            },
            {
              content: homeLabel,
              href: `/${ws?.id}`,
            },
          ]
        : [],
      [!!ws?.id]
    );

    return () => {
      setRootSegment([]);
    };
  }, [setRootSegment, ws, homeLabel, loadingLabel]);

  const [dateRange] = useState<DateRange>([null, null]);

  const startDate = dateRange?.[0]
    ? moment(dateRange[0]).format('YYYY-MM-DD')
    : '';

  const endDate = dateRange?.[1]
    ? moment(dateRange[1]).format('YYYY-MM-DD')
    : '';

  const dateRangeQuery = `?startDate=${startDate}&endDate=${endDate}`;

  const incomeApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/income${dateRangeQuery}`
    : null;

  const expenseApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/expense${dateRangeQuery}`
    : null;

  const walletsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/wallets/count`
    : null;

  const categoriesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/categories/count`
    : null;

  const transactionsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/transactions/count${dateRangeQuery}`
    : null;

  const invoicesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/invoices/count${dateRangeQuery}`
    : null;

  const { data: income, error: incomeError } = useSWR<number>(incomeApi);
  const { data: expense, error: expenseError } = useSWR<number>(expenseApi);

  const { data: walletsCount, error: walletsError } =
    useSWR<number>(walletsCountApi);

  const { data: categoriesCount, error: categoriesError } =
    useSWR<number>(categoriesCountApi);

  const { data: transactionsCount, error: transactionsError } =
    useSWR<number>(transactionsCountApi);

  const { data: invoicesCount, error: invoicesError } =
    useSWR<number>(invoicesCountApi);

  const isIncomeLoading = income === undefined && !incomeError;
  const isExpenseLoading = expense === undefined && !expenseError;
  const isWalletsCountLoading = walletsCount === undefined && !walletsError;
  const isCategoriesCountLoading =
    categoriesCount === undefined && !categoriesError;

  const isTransactionsCountLoading =
    transactionsCount === undefined && !transactionsError;

  const isInvoicesCountLoading = invoicesCount === undefined && !invoicesError;

  const walletsLabel = t('finance-tabs:wallets');
  const transactionsLabel = t('finance-tabs:transactions');
  const categoriesLabel = t('finance-tabs:transaction-categories');
  const invoicesLabel = t('finance-tabs:invoices');

  const totalBalance = t('finance-overview:total-balance');
  const totalIncome = t('finance-overview:total-income');
  const totalExpense = t('finance-overview:total-expense');

  const checkupsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/checkups/count`
    : null;

  const diagnosesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/diagnoses/count`
    : null;

  const vitalsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/vitals/count`
    : null;

  const groupsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/vital-groups/count`
    : null;

  const { data: checkups, error: checkupsError } =
    useSWR<number>(checkupsCountApi);
  const { data: diagnoses, error: diagnosesError } =
    useSWR<number>(diagnosesCountApi);
  const { data: vitals, error: vitalsError } = useSWR<number>(vitalsCountApi);
  const { data: groups, error: groupsError } = useSWR<number>(groupsCountApi);

  const isCheckupsLoading = checkups === undefined && !checkupsError;
  const isDiagnosesLoading = diagnoses === undefined && !diagnosesError;
  const isVitalsLoading = vitals === undefined && !vitalsError;
  const isGroupsLoading = groups === undefined && !groupsError;

  const productsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/products/count`
    : null;

  const productCategoriesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/categories/count`
    : null;

  const batchesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/batches/count`
    : null;

  const warehousesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/warehouses/count`
    : null;

  const unitsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/units/count`
    : null;

  const suppliersCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/inventory/suppliers/count`
    : null;

  const { data: products, error: productsError } = useSWR<{
    ws: number;
    inventory: number;
  }>(productsCountApi);

  const { data: categories, error: productCategoriesError } = useSWR<number>(
    productCategoriesCountApi
  );

  const { data: batches, error: batchesError } =
    useSWR<number>(batchesCountApi);

  const { data: warehouses, error: warehousesError } =
    useSWR<number>(warehousesCountApi);

  const { data: units, error: unitsError } = useSWR<number>(unitsCountApi);

  const { data: suppliers, error: suppliersError } =
    useSWR<number>(suppliersCountApi);

  const isProductsLoading = products === undefined && !productsError;
  const isCategoriesLoading =
    categories === undefined && !productCategoriesError;
  const isBatchesLoading = batches === undefined && !batchesError;
  const isWarehousesLoading = warehouses === undefined && !warehousesError;
  const isUnitsLoading = units === undefined && !unitsError;
  const isSuppliersLoading = suppliers === undefined && !suppliersError;

  const usersCountApi = ws?.id ? `/api/workspaces/${ws.id}/users/count` : null;

  const userGroupsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/users/groups/count`
    : null;

  const { data: users, error: usersError } = useSWR<number>(usersCountApi);
  const { data: userGroups, error: userGroupsError } =
    useSWR<number>(userGroupsCountApi);

  const isUsersLoading = users === undefined && !usersError;
  const isUserGroupsLoading = userGroups === undefined && !userGroupsError;

  const usersLabel = t('sidebar-tabs:users');

  if (!ws) return <div>{loadingLabel}</div>;
  const sum = (income || 0) + (expense || 0);

  return (
    <div className="">
      <HeaderX label={`${homeLabel} – ${ws?.name}`} />

      {ws?.id && (
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

          <Divider className="my-4" />
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
              loading={isIncomeLoading || isExpenseLoading}
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
              loading={isIncomeLoading}
            />

            <StatisticCard
              title={totalExpense}
              color="red"
              value={Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
                signDisplay: 'exceptZero',
              }).format(expense || 0)}
              loading={isExpenseLoading}
            />

            <StatisticCard
              title={walletsLabel}
              value={walletsCount}
              href={`/${ws?.id}/finance/wallets`}
              loading={isWalletsCountLoading}
            />

            <StatisticCard
              title={categoriesLabel}
              value={categoriesCount}
              href={`/${ws?.id}/finance/transactions/categories`}
              loading={isCategoriesCountLoading}
            />

            <StatisticCard
              title={transactionsLabel}
              value={transactionsCount}
              href={`/${ws?.id}/finance/transactions`}
              loading={isTransactionsCountLoading}
            />

            <StatisticCard
              title={invoicesLabel}
              value={invoicesCount}
              href={`/${ws?.id}/finance/invoices`}
              loading={isInvoicesCountLoading}
            />
          </div>

          <Divider className="mb-8 mt-4" variant="dashed" />
          <div className="mb-2 text-2xl font-semibold">
            {t('sidebar-tabs:healthcare')}
          </div>
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatisticCard
              title="Kiểm tra sức khoẻ"
              color="blue"
              value={checkups}
              href={`/${ws?.id}/healthcare/checkups`}
              loading={isCheckupsLoading}
            />

            <StatisticCard
              title="Chẩn đoán"
              value={diagnoses}
              href={`/${ws?.id}/healthcare/diagnoses`}
              loading={isDiagnosesLoading}
            />

            <StatisticCard
              title="Chỉ số"
              value={vitals}
              href={`/${ws?.id}/healthcare/vitals`}
              loading={isVitalsLoading}
            />

            <StatisticCard
              title="Nhóm chỉ số"
              value={groups}
              href={`/${ws?.id}/healthcare/vital-groups`}
              loading={isGroupsLoading}
            />
          </div>

          <Divider className="mb-8 mt-4" variant="dashed" />
          <div className="mb-2 text-2xl font-semibold">
            {t('sidebar-tabs:inventory')}
          </div>
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatisticCard
              title={t('inventory-tabs:products')}
              color="blue"
              value={products?.ws}
              href={`/${ws?.id}/inventory/products`}
              loading={isProductsLoading}
              className="md:col-span-2"
            />

            <StatisticCard
              title={t('inventory-overview:products-with-prices')}
              value={products?.inventory}
              href={`/${ws?.id}/inventory/products`}
              loading={isProductsLoading}
            />

            <StatisticCard
              title={t('inventory-tabs:product-categories')}
              value={categories}
              href={`/${ws?.id}/inventory/categories`}
              loading={isCategoriesLoading}
            />

            <StatisticCard
              title={t('inventory-tabs:batches')}
              value={batches}
              href={`/${ws?.id}/inventory/batches`}
              loading={isBatchesLoading}
            />

            <StatisticCard
              title={t('inventory-tabs:warehouses')}
              value={warehouses}
              href={`/${ws?.id}/inventory/warehouses`}
              loading={isWarehousesLoading}
            />

            <StatisticCard
              title={t('inventory-tabs:units')}
              value={units}
              href={`/${ws?.id}/inventory/units`}
              loading={isUnitsLoading}
            />

            <StatisticCard
              title={t('inventory-tabs:suppliers')}
              value={suppliers}
              href={`/${ws?.id}/inventory/suppliers`}
              loading={isSuppliersLoading}
            />
          </div>

          <Divider className="mb-8 mt-4" variant="dashed" />
          <div className="mb-2 text-2xl font-semibold">
            {t('sidebar-tabs:users')}
          </div>
          <div className="grid items-end gap-4 md:grid-cols-2">
            <StatisticCard
              title={usersLabel}
              color="blue"
              value={users}
              href={`/${ws?.id}/users/list`}
              loading={isUsersLoading}
            />

            <StatisticCard
              title={t('workspace-users-tabs:groups')}
              color="green"
              value={userGroups}
              href={`/${ws?.id}/users/groups`}
              loading={isUserGroupsLoading}
            />
          </div>
        </>
      )}
    </div>
  );
};

WorkspaceHomePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceHomePage;
