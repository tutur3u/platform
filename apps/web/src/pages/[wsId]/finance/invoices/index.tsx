import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import InvoiceCard from '../../../../components/cards/InvoiceCard';
import { Invoice } from '../../../../types/primitives/Invoice';
import useSWR from 'swr';
import StatusSelector from '../../../../components/selectors/StatusSelector';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../components/inputs/GeneralSearchBar';

export const getServerSideProps = enforceHasWorkspaces;

const MiscsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Tài chính', href: `/${ws.id}/finance` },
            {
              content: 'Hoá đơn',
              href: `/${ws.id}/finance/invoices`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [status, setStatus] = useState('');

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'finance-invoices-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/finance/invoices?status=${status}&query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = ws?.id
    ? `/api/workspaces/${ws.id}/finance/invoices/count`
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

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Hoá đơn – Tài chính" />
      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            label="Hiển thị số điện thoại"
            checked={showPhone}
            onChange={(event) => setShowPhone(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị giới tính"
            checked={showGender}
            onChange={(event) => setShowGender(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị địa chỉ"
            checked={showAddress}
            onChange={(event) => setShowAddress(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị thời gian tạo"
            checked={showTime}
            onChange={(event) => setShowTime(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị trạng thái"
            checked={showStatus}
            onChange={(event) => setShowStatus(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị số lượng sản phẩm"
            checked={showAmount}
            onChange={(event) => setShowAmount(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị giá tiền"
            checked={showPrice}
            onChange={(event) => setShowPrice(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị người tạo"
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
          <PlusCardButton href={`/${ws.id}/finance/invoices/new`} />

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
    </>
  );
};

MiscsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="finance">{page}</NestedLayout>;
};

export default MiscsPage;
