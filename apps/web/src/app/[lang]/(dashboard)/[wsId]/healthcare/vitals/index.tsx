import { useEffect, useState } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../../../components/selectors/ModeSelector';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../../../../components/common/PlusCardButton';
import GeneralItemCard from '../../../../../../components/cards/GeneralItemCard';
import { Vital } from '@/types/primitives/Vital';
import useSWR from 'swr';
import { useSegments } from '@/hooks/useSegments';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import PaginationSelector from '../../../../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../../components/inputs/GeneralSearchBar';

export default function MiscVitalsPage() {
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

  const [query] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'healthcare-vitals-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/healthcare/vitals?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  // const countApi = ws?.id
  //   ? `/api/workspaces/${ws.id}/healthcare/vitals/count`
  //   : null;

  const { data: vitals } = useSWR<Vital[]>(apiPath);
  // const { data: count } = useSWR<number>(countApi);

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
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
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
      <PaginationIndicator totalItems={0} />

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
  );
}
