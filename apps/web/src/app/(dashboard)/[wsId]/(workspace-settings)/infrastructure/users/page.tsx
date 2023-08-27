'use client';

import { useEffect, useState } from 'react';
import { useSegments } from '../../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import PaginationIndicator from '../../../../../../components/pagination/PaginationIndicator';
import { Divider } from '@mantine/core';
import PaginationSelector from '../../../../../../components/selectors/PaginationSelector';
import ModeSelector, {
  Mode,
} from '../../../../../../components/selectors/ModeSelector';
import { useLocalStorage } from '@mantine/hooks';
import { User } from '../../../../../../types/primitives/User';
import useSWR from 'swr';
import UserCard from '../../../../../../components/cards/UserCard';
import GeneralSearchBar from '../../../../../../components/inputs/GeneralSearchBar';

export default function InfrastructureUsersPage() {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('infrastructure-tabs');

  const infrastructureLabel = t('infrastructure');
  const usersLabel = t('users');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: infrastructureLabel, href: `/${ws.id}/infrastructure` },
            { content: usersLabel, href: `/${ws.id}/infrastructure/users` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [infrastructureLabel, usersLabel, ws, setRootSegment]);

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'infrastructure-users-per-page',
    defaultValue: 16,
  });

  const apiPath = ws?.id
    ? `/api/users?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data } = useSWR<{ data: User[]; count: number }>(apiPath);

  const users = data?.data;
  const count = data?.count;

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'workspace-users-mode',
    defaultValue: 'grid',
  });

  if (!ws) return null;

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
          evenNumbers
        />
        <div className="hidden xl:block" />
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
        {users?.map((u) => <UserCard key={u.id} user={u} />)}
      </div>
    </div>
  );
}
