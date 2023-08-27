import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../../components/common/PlusCardButton';
import GeneralItemCard from '../../../../../components/cards/GeneralItemCard';
import useSWR from 'swr';
import { VitalGroup } from '../../../../../types/primitives/VitalGroup';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../../hooks/useSegments';
import PaginationSelector from '../../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';

export const getServerSideProps = enforceHasWorkspaces;

const MiscVitalGroupsPage: PageWithLayoutProps = () => {
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
              content: 'Nhóm chỉ số',
              href: `/${ws.id}/healthcare/vital-groups`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'healthcare-vital-groups-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/healthcare/vital-groups?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const countApi = ws?.id
    ? `/api/workspaces/${ws.id}/healthcare/vital-groups/count`
    : null;

  const { data: groups } = useSWR<VitalGroup[]>(apiPath);
  const { data: count } = useSWR<number>(countApi);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'healthcare-vital-groups-mode',
    defaultValue: 'grid',
  });

  const [showDescription, setShowDescription] = useLocalStorage({
    key: 'healthcare-vital-groups-showDescription',
    defaultValue: false,
  });

  const [showNote, setShowNote] = useLocalStorage({
    key: 'healthcare-vital-groups-showNote',
    defaultValue: false,
  });

  const [showVitalAmount, setShowVitalAmount] = useLocalStorage({
    key: 'healthcare-vital-groups-showVitalAmount',
    defaultValue: true,
  });

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Chỉ số – Khám bệnh" />
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
          <div className="hidden xl:block" />
          <Divider variant="dashed" className="col-span-full" />
          <Switch
            label="Hiển thị mô tả"
            checked={showDescription}
            onChange={(event) =>
              setShowDescription(event.currentTarget.checked)
            }
          />
          <Switch
            label="Hiển thị ghi chú"
            checked={showNote}
            onChange={(event) => setShowNote(event.currentTarget.checked)}
          />
          <Switch
            label="Hiển thị số lượng chỉ số"
            checked={showVitalAmount}
            onChange={(event) =>
              setShowVitalAmount(event.currentTarget.checked)
            }
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
          <PlusCardButton href={`/${ws.id}/healthcare/vital-groups/new`} />

          {groups &&
            groups?.map((v) => (
              <GeneralItemCard
                key={v.id}
                name={v.name}
                href={`/${ws.id}/healthcare/vital-groups/${v.id}`}
                secondaryLabel={v?.description || 'Không có mô tả'}
                tertiaryLabel={v?.note || 'Không có ghi chú'}
                amountFetchPath={`/api/workspaces/${ws.id}/healthcare/vital-groups/${v.id}/vitals/count`}
                amountTrailing="chỉ số"
                showSecondaryLabel={showDescription}
                showTertiaryLabel={showNote}
                showAmount={showVitalAmount}
              />
            ))}
        </div>
      </div>
    </>
  );
};

MiscVitalGroupsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="healthcare">{page}</NestedLayout>;
};

export default MiscVitalGroupsPage;
