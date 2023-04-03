import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import { Divider, Switch, TextInput } from '@mantine/core';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import PrescriptionCard from '../../../../components/cards/PrescriptionCard';
import { Prescription } from '../../../../types/primitives/Prescription';
import useSWR from 'swr';
import StatusSelector from '../../../../components/selectors/StatusSelector';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';

export const getServerSideProps = enforceHasWorkspaces;

const MiscPrescriptionsPage: PageWithLayoutProps = () => {
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
            { content: 'Khám bệnh', href: `/${ws.id}/healthcare` },
            {
              content: 'Đơn thuốc',
              href: `/${ws.id}/healthcare/prescriptions`,
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
    key: 'healthcare-prescriptions-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/healthcare/prescriptions?status=${status}&query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/prescriptions/count`
    : null;

  const { data: prescriptions } = useSWR<Prescription[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'healthcare-prescriptions-mode',
    defaultValue: 'grid',
  });

  const [showPhone, setShowPhone] = useLocalStorage({
    key: 'healthcare-prescriptions-showPhone',
    defaultValue: false,
  });

  const [showGender, setShowGender] = useLocalStorage({
    key: 'healthcare-prescriptions-showGender',
    defaultValue: false,
  });

  const [showAddress, setShowAddress] = useLocalStorage({
    key: 'healthcare-prescriptions-showAddress',
    defaultValue: false,
  });

  const [showTime, setShowTime] = useLocalStorage({
    key: 'healthcare-prescriptions-showTime',
    defaultValue: true,
  });

  const [showStatus, setShowStatus] = useLocalStorage({
    key: 'healthcare-prescriptions-showStatus',
    defaultValue: true,
  });

  const [showAmount, setShowAmount] = useLocalStorage({
    key: 'healthcare-prescriptions-showAmount',
    defaultValue: true,
  });

  const [showPrice, setShowPrice] = useLocalStorage({
    key: 'healthcare-prescriptions-showPrice',
    defaultValue: true,
  });

  const [showCreator, setShowCreator] = useLocalStorage({
    key: 'healthcare-prescriptions-showCreator',
    defaultValue: false,
  });

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Đơn thuốc – Khám bệnh" />
      <div className="flex min-h-full w-full flex-col pb-8">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TextInput
            label="Tìm kiếm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập từ khoá để tìm kiếm"
            icon={<MagnifyingGlassIcon className="h-5" />}
            classNames={{
              input: 'bg-white/5 border-zinc-300/20 font-semibold',
            }}
          />
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
          <PlusCardButton href={`/${ws.id}/healthcare/prescriptions/new`} />

          {prescriptions &&
            prescriptions?.map((p) => (
              <PrescriptionCard
                key={p.id}
                prescription={p}
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

MiscPrescriptionsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="healthcare">{page}</NestedLayout>;
};

export default MiscPrescriptionsPage;
