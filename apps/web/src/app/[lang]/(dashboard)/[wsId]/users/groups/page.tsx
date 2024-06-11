import { UserDatabaseFilter } from '../filters';
import { DataTable } from '@/components/ui/custom/tables/data-table';
import { getUserGroupColumns } from '@/data/columns/user-groups';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { UserGroup } from '@/types/primitives/UserGroup';
import { Database } from '@/types/supabase';
import { MinusCircledIcon, PlusCircledIcon } from '@radix-ui/react-icons';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedTags?: string | string[];
  excludedTags?: string | string[];
}

interface Props {
  params: {
    wsId: string;
  };
  searchParams: SearchParams;
}

export default async function WorkspaceUserGroupsPage({
  params: { wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);
  const { t } = useTranslation('user-group-data-table');

  const { data, count } = await getData(wsId, searchParams);

  const groups = data.map((g) => ({
    ...g,
    href: `/${wsId}/users/groups/${g.id}`,
  }));

  const { data: tags } = await getTags(wsId);
  const { data: excludedTags } = await getExcludedTags(wsId, searchParams);

  return (
    <DataTable
      data={groups}
      columnGenerator={getUserGroupColumns}
      namespace="user-group-data-table"
      count={count}
      filters={[
        <UserDatabaseFilter
          key="included-user-tags-filter"
          tag="includedTags"
          title={t('included_tags')}
          icon={<PlusCircledIcon className="mr-2 h-4 w-4" />}
          options={tags.map((tag) => ({
            label: tag.name || 'No name',
            value: tag.id,
            count: tag.amount,
          }))}
          disabled
        />,
        <UserDatabaseFilter
          key="excluded-user-tags-filter"
          tag="excludedTags"
          title={t('excluded_tags')}
          icon={<MinusCircledIcon className="mr-2 h-4 w-4" />}
          options={excludedTags.map((tag) => ({
            label: tag.name || 'No name',
            value: tag.id,
            count: tag.amount,
          }))}
          disabled
        />,
      ]}
      defaultVisibility={{
        id: false,
        locked: false,
        created_at: false,
      }}
    />
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_user_groups_with_amount')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name');

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: UserGroup[]; count: number };
}

async function getTags(wsId: string) {
  const supabase = createServerComponentClient({ cookies });

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

async function getExcludedTags(wsId: string, { includedTags }: SearchParams) {
  const supabase = createServerComponentClient({ cookies });

  if (!includedTags || includedTags.length === 0) {
    return getTags(wsId);
  }

  const queryBuilder = supabase
    .rpc(
      'get_possible_excluded_groups',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedTags)
          ? includedTags
          : [includedTags],
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
