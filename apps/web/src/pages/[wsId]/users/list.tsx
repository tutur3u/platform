import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, { Mode } from '../../../components/selectors/ModeSelector';
import { Divider, Pagination, Switch, TextInput } from '@mantine/core';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import PlusCardButton from '../../../components/common/PlusCardButton';
import PatientCard from '../../../components/cards/PatientCard';
import useSWR from 'swr';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import { WorkspaceUser } from '../../../types/primitives/WorkspaceUser';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceUsersPage: PageWithLayoutProps = () => {
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
            { content: 'Users', href: `/${ws.id}/users` },
            {
              content: 'List',
              href: `/${ws.id}/users/list`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const apiPath = `/api/workspaces/${ws?.id}/users`;
  const { data: users } = useSWR<WorkspaceUser[]>(ws?.id ? apiPath : null);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'workspace-users-mode',
    defaultValue: 'grid',
  });

  const [showPhone, setShowPhone] = useLocalStorage({
    key: 'workspace-users-showPhone',
    defaultValue: true,
  });

  const [showGender, setShowGender] = useLocalStorage({
    key: 'workspace-users-showGender',
    defaultValue: true,
  });

  const [showAddress, setShowAddress] = useLocalStorage({
    key: 'workspace-users-showAddress',
    defaultValue: true,
  });

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Danh sách – Người dùng" />
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
          <PlusCardButton href={`/${ws.id}/users/new`} />
          {users &&
            users?.map((p) => (
              <PatientCard
                key={p.id}
                user={p}
                showAddress={showAddress}
                showGender={showGender}
                showPhone={showPhone}
              />
            ))}
        </div>
      </div>
    </>
  );
};

WorkspaceUsersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace_users">{page}</NestedLayout>;
};

export default WorkspaceUsersPage;
