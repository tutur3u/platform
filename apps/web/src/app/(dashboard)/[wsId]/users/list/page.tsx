'use client';

import { useEffect, useState } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import { Divider, Switch } from '@mantine/core';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import WorkspaceUserCard from '@/components/cards/WorkspaceUserCard';
import PlusCardButton from '@/components/common/PlusCardButton';
import PaginationIndicator from '@/components/pagination/PaginationIndicator';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import ModeSelector, { Mode } from '@/components/selectors/ModeSelector';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import PaginationSelector from '@/components/selectors/PaginationSelector';

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
    key: 'users-items-per-page',
    defaultValue: 15,
  });

  const apiPath = wsId
    ? `/api/workspaces/${wsId}/users?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
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
        <PlusCardButton href={`/${wsId}/users/new`} />
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
  );
}
