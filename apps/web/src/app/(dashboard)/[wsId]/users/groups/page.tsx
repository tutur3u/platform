'use client';

import { useEffect, useState } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import { Divider, Switch } from '@mantine/core';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { UserGroup } from '@/types/primitives/UserGroup';
import ModeSelector, { Mode } from '@/components/selectors/ModeSelector';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import PaginationSelector from '@/components/selectors/PaginationSelector';
import PaginationIndicator from '@/components/pagination/PaginationIndicator';
import PlusCardButton from '@/components/common/PlusCardButton';
import GeneralItemCard from '@/components/cards/GeneralItemCard';

interface Props {
  params: {
    wsId: string;
  };
}

export default function WorkspaceUsersPage({ params: { wsId } }: Props) {
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'users-groups-items-per-page',
    defaultValue: 15,
  });

  const apiPath = wsId
    ? `/api/workspaces/${wsId}/users/groups?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data } = useSWR<{ data: UserGroup[]; count: number }>(apiPath);

  const groups = data?.data;
  const count = data?.count;

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'workspace-users-mode',
    defaultValue: 'grid',
  });

  const [showUsers, setShowUsers] = useLocalStorage({
    key: 'workspace-users-groups-showUsers',
    defaultValue: true,
  });

  return (
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
          label={t('ws-user-groups-configs:show-users')}
          checked={showUsers}
          onChange={(event) => setShowUsers(event.currentTarget.checked)}
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
        <PlusCardButton href={`/${wsId}/users/groups/new`} />
        {groups &&
          groups?.map((group) => (
            <GeneralItemCard
              key={group.id}
              name={group.name}
              href={`/${wsId}/users/groups/${group.id}`}
              amountFetchPath={`/api/workspaces/${wsId}/users/groups/${group.id}/amount`}
              amountTrailing={t('sidebar-tabs:users').toLowerCase()}
              showAmount={showUsers}
            />
          ))}
      </div>
    </div>
  );
}
