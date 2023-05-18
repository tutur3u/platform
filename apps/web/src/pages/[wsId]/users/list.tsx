import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, { Mode } from '../../../components/selectors/ModeSelector';
import { Divider, Switch } from '@mantine/core';
import PlusCardButton from '../../../components/common/PlusCardButton';
import useSWR from 'swr';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import { WorkspaceUser } from '../../../types/primitives/WorkspaceUser';
import PaginationSelector from '../../../components/selectors/PaginationSelector';
import PaginationIndicator from '../../../components/pagination/PaginationIndicator';
import WorkspaceUserCard from '../../../components/cards/WorkspaceUserCard';
import GeneralSearchBar from '../../../components/inputs/GeneralSearchBar';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceUsersPage: PageWithLayoutProps = () => {
  const { t } = useTranslation();

  const usersLabel = t('sidebar-tabs:users');
  const listLabel = t('workspace-users-tabs:list');

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
            { content: usersLabel, href: `/${ws.id}/users` },
            {
              content: listLabel,
              href: `/${ws.id}/users/list`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, usersLabel, listLabel, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'users-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/users?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data } = useSWR<{ data: WorkspaceUser[]; count: number }>(apiPath);

  const users = data?.data;
  const count = data?.count;

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

  if (!ws) return null;

  return (
    <>
      <HeaderX label={`${listLabel} – ${usersLabel}`} />
      <div className="flex min-h-full w-full flex-col pb-20">
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
            label={t('ws-users-list-configs:show-phone')}
            checked={showPhone}
            onChange={(event) => setShowPhone(event.currentTarget.checked)}
          />
          <Switch
            label={t('ws-users-list-configs:show-gender')}
            checked={showGender}
            onChange={(event) => setShowGender(event.currentTarget.checked)}
          />
          <Switch
            label={t('ws-users-list-configs:show-address')}
            checked={showAddress}
            onChange={(event) => setShowAddress(event.currentTarget.checked)}
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
          <PlusCardButton href={`/${ws.id}/users/new`} />
          {users &&
            users?.map((p) => (
              <WorkspaceUserCard
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
