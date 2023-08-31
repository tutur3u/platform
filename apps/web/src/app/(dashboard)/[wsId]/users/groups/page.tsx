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

  // const apiPath = wsId
  //   ? `/api/workspaces/${wsId}/users/groups?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
  //   : null;

  // const { data } = useSWR<{ data: UserGroup[]; count: number }>(apiPath);

  // const groups = data?.data;
  // const count = data?.count;

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
      </div>

      <Divider className="mt-4" />
      {/* <PaginationIndicator totalItems={count} /> */}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlusCardButton href={`/${wsId}/users/groups/new`} />
        {/* {          groups.map((group) => (
            <GeneralItemCard
              key={group.id}
              name={group.name}
              href={`/${wsId}/users/groups/${group.id}`}
              amountFetchPath={`/api/workspaces/${wsId}/users/groups/${group.id}/amount`}
              amountTrailing={t('sidebar-tabs:users').toLowerCase()}
              showAmount={showUsers}
            />
          ))} */}
      </div>
    </div>
  );
}
