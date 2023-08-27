'use client';

import { useState } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../../components/common/PlusCardButton';
import InvoiceCard from '../../../../../components/cards/InvoiceCard';
import { Invoice } from '../../../../../types/primitives/Invoice';
import useSWR from 'swr';
import StatusSelector from '../../../../../components/selectors/StatusSelector';
import PaginationSelector from '../../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  params: {
    wsId: string;
  };
}

export default function WorkspaceInvoicesPage({ params: { wsId } }: Props) {
  const { t } = useTranslation('invoices');

  const [status, setStatus] = useState('');

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'finance-invoices-items-per-page',
    defaultValue: 15,
  });

  const apiPath = wsId
    ? `/api/workspaces/${wsId}/finance/invoices?status=${status}&query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = wsId
    ? `/api/workspaces/${wsId}/finance/invoices/count`
    : null;

  const { data: invoices } = useSWR<Invoice[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'finance-invoices-mode',
    defaultValue: 'grid',
  });

  const [showPhone, setShowPhone] = useLocalStorage({
    key: 'finance-invoices-showPhone',
    defaultValue: false,
  });

  const [showGender, setShowGender] = useLocalStorage({
    key: 'finance-invoices-showGender',
    defaultValue: false,
  });

  const [showAddress, setShowAddress] = useLocalStorage({
    key: 'finance-invoices-showAddress',
    defaultValue: false,
  });

  const [showTime, setShowTime] = useLocalStorage({
    key: 'finance-invoices-showTime',
    defaultValue: true,
  });

  const [showStatus, setShowStatus] = useLocalStorage({
    key: 'finance-invoices-showStatus',
    defaultValue: true,
  });

  const [showAmount, setShowAmount] = useLocalStorage({
    key: 'finance-invoices-showAmount',
    defaultValue: true,
  });

  const [showPrice, setShowPrice] = useLocalStorage({
    key: 'finance-invoices-showPrice',
    defaultValue: true,
  });

  const [showCreator, setShowCreator] = useLocalStorage({
    key: 'finance-invoices-showCreator',
    defaultValue: false,
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
        <StatusSelector
          status={status}
          setStatus={setStatus}
          preset="completion"
        />
        <div className="col-span-2 hidden xl:block" />
        <Divider variant="dashed" className="col-span-full" />
        <Switch
          label={t('show-phone')}
          checked={showPhone}
          onChange={(event) => setShowPhone(event.currentTarget.checked)}
        />
        <Switch
          label={t('show-gender')}
          checked={showGender}
          onChange={(event) => setShowGender(event.currentTarget.checked)}
        />
        <Switch
          label={t('show-address')}
          checked={showAddress}
          onChange={(event) => setShowAddress(event.currentTarget.checked)}
        />
        <Switch
          label={t('show-time')}
          checked={showTime}
          onChange={(event) => setShowTime(event.currentTarget.checked)}
        />
        <Switch
          label={t('show-status')}
          checked={showStatus}
          onChange={(event) => setShowStatus(event.currentTarget.checked)}
        />
        <Switch
          label={t('show-amount')}
          checked={showAmount}
          onChange={(event) => setShowAmount(event.currentTarget.checked)}
        />
        <Switch
          label={t('show-price')}
          checked={showPrice}
          onChange={(event) => setShowPrice(event.currentTarget.checked)}
        />
        <Switch
          label={t('show-creator')}
          checked={showCreator}
          onChange={(event) => setShowCreator(event.currentTarget.checked)}
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
        <PlusCardButton href={`/${wsId}/finance/invoices/new`} />

        {invoices &&
          invoices?.map((p) => (
            <InvoiceCard
              key={p.id}
              invoice={p}
              showAddress={showAddress}
              showGender={showGender}
              showPhone={showPhone}
              showTime={showTime}
              showStatus={showStatus}
              showAmount={showAmount}
              showPrice={showPrice}
              showCreator={showCreator}
            />
          ))}
      </div>
    </div>
  );
}
