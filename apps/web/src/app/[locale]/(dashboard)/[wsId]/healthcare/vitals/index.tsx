import PlusCardButton from '../../../../../../components/common/PlusCardButton';
import GeneralSearchBar from '../../../../../../components/inputs/GeneralSearchBar';
import PaginationIndicator from '../../../../../../components/pagination/PaginationIndicator';
import { useSegments } from '@/hooks/useSegments';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Divider, Switch } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useEffect } from 'react';

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

  // const countApi = ws?.id
  //   ? `/api/workspaces/${ws.id}/healthcare/vitals/count`
  //   : null;

  // const { data: count } = useSWR<number>(countApi);

  const [showUnit, setShowUnit] = useLocalStorage({
    key: 'healthcare-vitals-showUnit',
    defaultValue: true,
  });

  if (!ws) return null;

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
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

      <div className={`grid gap-4 ${'md:grid-cols-2 xl:grid-cols-4'}`}>
        <PlusCardButton href={`/${ws.id}/healthcare/vitals/new`} />
      </div>
    </div>
  );
}
