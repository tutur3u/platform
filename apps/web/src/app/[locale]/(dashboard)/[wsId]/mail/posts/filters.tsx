import { Filter } from '../../users/filters';
import { createClient } from '@tuturuuu/supabase/next/server';
import { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { MinusCircle, PlusCircle, User } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
}

export default async function Filters({
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
  const t = await getTranslations();

  const { data: userGroups } = await getUserGroups(wsId);
  const { data: excludedUserGroups } = await getExcludedUserGroups(
    wsId,
    searchParams
  );
  const { data: users } = await getUsers(wsId);

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
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups_with_amount')
    .select('id, name, amount', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}

async function getExcludedUserGroups(
  wsId: string,
  { includedGroups }: SearchParams
) {
  const supabase = await createClient();

  if (!includedGroups || includedGroups.length === 0) {
    return getUserGroups(wsId);
  }

  const queryBuilder = supabase
    .rpc(
      'get_possible_excluded_groups',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
      },
      {
        count: 'exact',
      }
    )
    .select('id, name, amount')
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}

async function getUsers(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_users')
    .select('id, full_name')
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
