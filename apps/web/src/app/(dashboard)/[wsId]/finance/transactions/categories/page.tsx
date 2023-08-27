'use client';

import { useState } from 'react';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../../../components/common/PlusCardButton';
import { useLocalStorage } from '@mantine/hooks';
import { TransactionCategory } from '../../../../../../types/primitives/TransactionCategory';
import useSWR from 'swr';
import GeneralItemCard from '../../../../../../components/cards/GeneralItemCard';
import ModeSelector, {
  Mode,
} from '../../../../../../components/selectors/ModeSelector';
import PaginationSelector from '../../../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../../components/inputs/GeneralSearchBar';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  params: {
    wsId: string;
  };
}

export default function FinanceCategoriesPage({ params: { wsId } }: Props) {
  const { t } = useTranslation('categories');

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'finance-categories-items-per-page',
    defaultValue: 15,
  });

  const apiPath = wsId
    ? `/api/workspaces/${wsId}/finance/transactions/categories?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = wsId
    ? `/api/workspaces/${wsId}/finance/transactions/categories/count`
    : null;

  const { data: categories } = useSWR<TransactionCategory[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-categories-mode',
    defaultValue: 'grid',
  });

  const [showAmount, setShowAmount] = useLocalStorage({
    key: 'finance-transactions-categories-showAmount',
    defaultValue: true,
  });

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar setQuery={setQuery} />
        <ModeSelector mode={mode} setMode={setMode} />
        <PaginationSelector
          items={itemsPerPage}
          setItems={(size) => {
            setPage(1);
            setItemsPerPage(size);
          }}
        />
        <Divider variant="dashed" className="col-span-full" />
        <Switch
          label={t('show-amount-of-transaction')}
          checked={showAmount}
          onChange={(event) => setShowAmount(event.currentTarget.checked)}
        />
      </div>

      <Divider className="mt-4" />
      <PaginationIndicator
        activePage={activePage}
        setActivePage={setPage}
        itemsPerPage={itemsPerPage}
        totalItems={count}
      />

      <div
        className={`grid gap-4 ${
          mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
        }`}
      >
        <PlusCardButton href={`/${wsId}/finance/transactions/categories/new`} />
        {categories &&
          categories?.map((c) => (
            <GeneralItemCard
              key={c.id}
              href={`/${wsId}/finance/transactions/categories/${c.id}`}
              name={c.name}
              amountFetchPath={`/api/workspaces/${wsId}/finance/transactions/categories/${c.id}/amount`}
              amountTrailing="giao dịch"
              showAmount={showAmount}
            />
          ))}
      </div>
    </div>
  );
}
