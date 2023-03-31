import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import { Divider, Pagination, Switch, TextInput } from '@mantine/core';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import CheckupCard from '../../../../components/cards/CheckupCard';
import { Checkup } from '../../../../types/primitives/Checkup';
import useSWR from 'swr';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const MiscExaminationPage: PageWithLayoutProps = () => {
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

  const apiPath = `/api/workspaces/${ws?.id}/healthcare/checkups`;
  const { data: checkups } = useSWR<Checkup[]>(ws?.id ? apiPath : null);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'healthcare-checkups-mode',
    defaultValue: 'grid',
  });

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

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  return (
    <>
      <HeaderX label="Kiểm tra sức khoẻ – Khám bệnh" />
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
        <div className="flex items-center justify-center py-4 text-center">
          <Pagination value={activePage} onChange={setPage} total={10} noWrap />
        </div>

        <div
          className={`grid gap-4 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
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
    </>
  );
};

MiscExaminationPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="healthcare">{page}</NestedLayout>;
};

export default MiscExaminationPage;
