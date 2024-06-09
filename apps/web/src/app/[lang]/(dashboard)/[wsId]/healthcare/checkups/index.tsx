import CheckupCard from '../../../../../../components/cards/CheckupCard';
import PlusCardButton from '../../../../../../components/common/PlusCardButton';
import PaginationIndicator from '../../../../../../components/pagination/PaginationIndicator';
import { useSegments } from '@/hooks/useSegments';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Checkup } from '@/types/primitives/Checkup';
import { Divider, Switch } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

export default function MiscExaminationPage() {
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
              content: 'Kiểm tra sức khoẻ',
              href: `/${ws.id}/healthcare/checkups`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [activePage] = useState(1);

  const [itemsPerPage] = useLocalStorage({
    key: 'healthcare-checkups-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/healthcare/checkups?page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  // const countApi = ws?.id
  //   ? `/api/workspaces/${ws.id}/healthcare/checkups/count`
  //   : null;

  const { data: checkups } = useSWR<Checkup[]>(apiPath);
  // const { data: count } = useSWR<number>(countApi);

  const [showPhone, setShowPhone] = useLocalStorage({
    key: 'healthcare-checkups-showPhone',
    defaultValue: false,
  });

  const [showGender, setShowGender] = useLocalStorage({
    key: 'healthcare-checkups-showGender',
    defaultValue: false,
  });

  const [showAddress, setShowAddress] = useLocalStorage({
    key: 'healthcare-checkups-showAddress',
    defaultValue: false,
  });

  const [showTime, setShowTime] = useLocalStorage({
    key: 'healthcare-checkups-showTime',
    defaultValue: true,
  });

  const [showStatus, setShowStatus] = useLocalStorage({
    key: 'healthcare-checkups-showStatus',
    defaultValue: true,
  });

  const [showDiagnosis, setShowDiagnosis] = useLocalStorage({
    key: 'healthcare-checkups-showDiagnosis',
    defaultValue: true,
  });

  const [showCreator, setShowCreator] = useLocalStorage({
    key: 'healthcare-checkups-showCreator',
    defaultValue: false,
  });

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          label="Hiển thị chẩn đoán"
          checked={showDiagnosis}
          onChange={(event) => setShowDiagnosis(event.currentTarget.checked)}
        />
        <Switch
          label="Hiển thị người tạo"
          checked={showCreator}
          onChange={(event) => setShowCreator(event.currentTarget.checked)}
        />
      </div>

      <Divider className="mt-4" />
      <PaginationIndicator totalItems={0} />

      <div className={`grid gap-4 ${'md:grid-cols-2 xl:grid-cols-4'}`}>
        <PlusCardButton href={`/${ws?.id}/healthcare/checkups/new`} />

        {checkups &&
          checkups?.map((c) => (
            <CheckupCard
              key={c.id}
              checkup={c}
              showAddress={showAddress}
              showGender={showGender}
              showPhone={showPhone}
              showTime={showTime}
              showStatus={showStatus}
              showDiagnosis={showDiagnosis}
              showCreator={showCreator}
            />
          ))}
      </div>
    </div>
  );
}
