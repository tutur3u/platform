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
import GeneralItemCard from '../../../../components/cards/GeneralItemCard';
import { Vital } from '../../../../types/primitives/Vital';
import useSWR from 'swr';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';

export const getServerSideProps = enforceHasWorkspaces;

const MiscVitalsPage: PageWithLayoutProps = () => {
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
              content: 'Chỉ số',
              href: `/${ws.id}/healthcare/vitals`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'healthcare-vitals-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/healthcare/vitals?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/vitals/count`
    : null;

  const { data: vitals } = useSWR<Vital[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'healthcare-vitals-mode',
    defaultValue: 'grid',
  });

  const [showUnit, setShowUnit] = useLocalStorage({
    key: 'healthcare-vitals-showUnit',
    defaultValue: true,
  });

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Chỉ số – Khám bệnh" />
      <div className="flex min-h-full w-full flex-col pb-20">
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
          <div className="hidden xl:block" />
          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label="Hiển thị đơn vị"
            checked={showUnit}
            onChange={(event) => setShowUnit(event.currentTarget.checked)}
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
          <PlusCardButton href={`/${ws.id}/healthcare/vitals/new`} />

          {vitals &&
            vitals?.map((v) => (
              <GeneralItemCard
                key={v.id}
                name={v.name}
                hint={v.unit}
                href={`/${ws.id}/healthcare/vitals/${v.id}`}
                showHint={showUnit}
              />
            ))}
        </div>
      </div>
    </>
  );
};

MiscVitalsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="healthcare">{page}</NestedLayout>;
};

export default MiscVitalsPage;
