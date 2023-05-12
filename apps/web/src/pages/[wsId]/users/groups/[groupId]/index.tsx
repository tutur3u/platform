import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../../components/settings/SettingItemCard';
import { useRouter } from 'next/router';
import { UserGroup } from '../../../../../types/primitives/UserGroup';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../../components/selectors/ModeSelector';
import { WorkspaceUser } from '../../../../../types/primitives/WorkspaceUser';
import PaginationIndicator from '../../../../../components/pagination/PaginationIndicator';
import { Divider, Switch } from '@mantine/core';
import WorkspaceUserCard from '../../../../../components/cards/WorkspaceUserCard';
import PaginationSelector from '../../../../../components/selectors/PaginationSelector';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';

export const getServerSideProps = enforceHasWorkspaces;

const RoleDetailsPage: PageWithLayoutProps = () => {
  const { t } = useTranslation('ws-user-groups-details');

  const usersLabel = t('sidebar-tabs:users');
  const groupsLabel = t('workspace-users-tabs:groups');
  const informationLabel = t('ws-user-groups-details-tabs:information');
  const untitledLabel = t('common:untitled');

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, groupId } = router.query;

  const apiPath =
    wsId && groupId ? `/api/workspaces/${wsId}/users/groups/${groupId}` : null;

  const { data: group } = useSWR<UserGroup>(apiPath);

  useEffect(() => {
    setRootSegment(
      ws && group
        ? [
            {
              content: ws?.name || untitledLabel,
              href: `/${ws.id}`,
            },
            { content: usersLabel, href: `/${ws.id}/users` },
            {
              content: groupsLabel,
              href: `/${ws.id}/users/groups`,
            },
            {
              content: group?.name || untitledLabel,
              href: `/${ws.id}/users/groups/${group.id}`,
            },
            {
              content: informationLabel,
              href: `/${ws.id}/users/groups/${group.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [
    ws,
    group,
    usersLabel,
    groupsLabel,
    informationLabel,
    untitledLabel,
    setRootSegment,
  ]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'workspace-user-groups-items-per-page',
    defaultValue: 15,
  });

  const usersApiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/users?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}&groupId=${groupId}`
    : null;

  const { data } = useSWR<{ data: WorkspaceUser[]; count: number }>(
    usersApiPath
  );

  const users = data?.data;
  const count = data?.count;

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'workspace-user-groups-mode',
    defaultValue: 'grid',
  });

  const [showPhone, setShowPhone] = useLocalStorage({
    key: 'workspace-user-groups-showPhone',
    defaultValue: true,
  });

  const [showGender, setShowGender] = useLocalStorage({
    key: 'workspace-user-groups-showGender',
    defaultValue: true,
  });

  const [showAddress, setShowAddress] = useLocalStorage({
    key: 'workspace-user-groups-showAddress',
    defaultValue: true,
  });

  if (!ws) return null;

  return (
    <>
      <HeaderX
        label={`${informationLabel} – ${group?.name || untitledLabel}`}
      />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
        <SettingItemCard title={group?.name || untitledLabel} />

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
          {/* <PlusCardButton onClick={() => {}} /> */}
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

RoleDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="user_group_details">{page}</NestedLayout>;
};

export default RoleDetailsPage;
