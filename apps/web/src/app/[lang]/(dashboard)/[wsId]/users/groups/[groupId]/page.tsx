'use client';

import { useState } from 'react';
import SettingItemCard from '../../../../../../../components/settings/SettingItemCard';
import { UserGroup } from '../../../../../../../types/primitives/UserGroup';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { useLocalStorage } from '@mantine/hooks';
import ModeSelector, {
  Mode,
} from '../../../../../../../components/selectors/ModeSelector';
import { WorkspaceUser } from '../../../../../../../types/primitives/WorkspaceUser';
import PaginationIndicator from '../../../../../../../components/pagination/PaginationIndicator';
import { Divider, Switch } from '@mantine/core';
import WorkspaceUserCard from '../../../../../../../components/cards/WorkspaceUserCard';
import PaginationSelector from '../../../../../../../components/selectors/PaginationSelector';
import GeneralSearchBar from '../../../../../../../components/inputs/GeneralSearchBar';

interface Props {
  params: {
    wsId: string;
    groupId: string;
  };
}

export default function UserGroupDetailsPage({
  params: { wsId, groupId },
}: Props) {
  const { t } = useTranslation('ws-user-groups-details');

  const untitledLabel = t('common:untitled');

  const apiPath =
    wsId && groupId ? `/api/workspaces/${wsId}/users/groups/${groupId}` : null;

  const { data: group } = useSWR<UserGroup>(apiPath);

  const [query] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'workspace-user-groups-items-per-page',
    defaultValue: 16,
  });

  const usersApiPath =
    wsId && groupId
      ? `/api/workspaces/${wsId}/users?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}&groupId=${groupId}`
      : null;

  const { data } = useSWR<{ data: WorkspaceUser[]; count: number }>(
    usersApiPath
  );

  const users = data?.data;
  // const count = data?.count;

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

  return (
    <div className="flex min-h-full w-full flex-col ">
      <SettingItemCard title={group?.name || untitledLabel} />

      <div className="mt-4 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
        <ModeSelector mode={mode} setMode={setMode} />
        <PaginationSelector
          items={itemsPerPage}
          setItems={(size) => {
            setPage(1);
            setItemsPerPage(size);
          }}
          evenNumbers
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
      <PaginationIndicator totalItems={0} />

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
              wsId={wsId}
              user={p}
              showAddress={showAddress}
              showGender={showGender}
              showPhone={showPhone}
            />
          ))}
      </div>
    </div>
  );
}
