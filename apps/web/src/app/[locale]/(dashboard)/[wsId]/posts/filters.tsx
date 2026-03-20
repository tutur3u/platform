'use client';

import { MinusCircle, PlusCircle, User } from '@tuturuuu/icons';
import { getPostsFilterOptions } from '@tuturuuu/internal-api/settings';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Filter } from '../users/filters';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
}

export default function PostsFilters({
  wsId,
  searchParams,
  noInclude = false,
  noExclude = false,
}: {
  wsId: string;
  searchParams: SearchParams;
  noInclude?: boolean;
  noExclude?: boolean;
}) {
  const t = useTranslations();
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [excludedUserGroups, setExcludedUserGroups] = useState<UserGroup[]>([]);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userGroupsData, excludedGroupsData, usersData] =
          await Promise.all([
            getUserGroups(wsId),
            getExcludedUserGroups(wsId, searchParams),
            getUsers(wsId),
          ]);

        setUserGroups(userGroupsData.data);
        setExcludedUserGroups(excludedGroupsData.data);
        setUsers(usersData.data);
      } catch (error) {
        console.error('Failed to load filter data:', error);
      }
    };

    loadData();
  }, [wsId, searchParams]);

  return (
    <>
      {noInclude || (
        <Filter
          key="included-user-groups-filter"
          tag="includedGroups"
          title={t('user-data-table.included_groups')}
          icon={<PlusCircle className="mr-2 h-4 w-4" />}
          options={userGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      )}
      {noExclude || (
        <Filter
          key="excluded-user-groups-filter"
          tag="excludedGroups"
          title={t('user-data-table.excluded_groups')}
          icon={<MinusCircle className="mr-2 h-4 w-4" />}
          options={excludedUserGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      )}
      <Filter
        key="user-filter"
        tag="userId"
        title={t('user-data-table.user')}
        icon={<User className="mr-2 h-4 w-4" />}
        options={users.map((user) => ({
          label: user.full_name || 'No name',
          value: user.id,
        }))}
        multiple={false}
      />
    </>
  );
}

async function getUserGroups(wsId: string) {
  const data = await getPostsFilterOptions(wsId);
  return {
    data: data.userGroups as UserGroup[],
    count: data.userGroups.length,
  };
}

async function getExcludedUserGroups(
  wsId: string,
  { includedGroups }: SearchParams
) {
  const data = await getPostsFilterOptions(wsId, {
    includedGroups: Array.isArray(includedGroups)
      ? includedGroups
      : includedGroups
        ? [includedGroups]
        : [],
  });
  return {
    data: data.excludedUserGroups as UserGroup[],
    count: data.excludedUserGroups.length,
  };
}

async function getUsers(wsId: string) {
  const data = await getPostsFilterOptions(wsId);
  return { data: data.users as WorkspaceUser[], count: data.users.length };
}
