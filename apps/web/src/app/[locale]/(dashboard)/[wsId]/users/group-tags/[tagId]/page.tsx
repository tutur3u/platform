import { UserDatabaseFilter } from '../../filters';
import { getUserGroupColumns } from '../../groups/columns';
import UserGroupForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { UserGroup } from '@/types/primitives/UserGroup';
import { UserGroupTag } from '@/types/primitives/UserGroupTag';
import { createClient } from '@/utils/supabase/server';
import { MinusCircledIcon } from '@radix-ui/react-icons';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  excludedTags?: string | string[];
}

interface Props {
  params: {
    wsId: string;
    tagId: string;
  };
  searchParams: SearchParams;
}

export default async function GroupTagDetailsPage({
  params: { wsId, tagId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);
  const t = await getTranslations();

  const tag = await getData(wsId, tagId);

  const { data: rawUserGroups, count: userGroupsCount } = await getGroupData(
    wsId,
    tagId,
    searchParams
  );

  const { data: excludedUserGroups } = await getExcludedGroupTags(wsId, tagId);

  const userGroups = rawUserGroups.map((g) => ({
    ...g,
    href: `/${wsId}/users/groups/${g.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={tag.name || t('ws-user-groups.plural')}
        singularTitle={tag.name || t('ws-user-groups.singular')}
        description={t('ws-user-groups.description')}
        createTitle={t('ws-user-group-tags.add_group')}
        createDescription={t('ws-user-group-tags.add_group_description')}
        form={<UserGroupForm tagId={tagId} wsId={wsId} />}
      />
      <Separator className="my-4" />

      <CustomDataTable
        data={userGroups}
        namespace="user-group-data-table"
        columnGenerator={getUserGroupColumns}
        extraData={{ wsId, tagId }}
        count={userGroupsCount}
        filters={[
          <UserDatabaseFilter
            key="excluded-user-groups-filter"
            tag="excludedGroups"
            title={t('user-group-data-table.excluded_tags')}
            icon={<MinusCircledIcon className="mr-2 h-4 w-4" />}
            options={excludedUserGroups.map((group) => ({
              label: group.name || 'No name',
              value: group.id as string,
              count: group.amount,
            }))}
          />,
        ]}
        defaultVisibility={{
          id: false,
          gender: false,
          avatar_url: false,
          display_name: false,
          ethnicity: false,
          guardian: false,
          address: false,
          national_id: false,
          note: false,
          linked_users: false,
          group_count: false,
          created_at: false,
          updated_at: false,
        }}
      />
    </>
  );
}

async function getData(wsId: string, tagId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_user_group_tags')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', tagId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as UserGroupTag;
}

async function getGroupData(
  wsId: string,
  tagId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    excludedTags = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_user_groups',
      {
        _ws_id: wsId,
        included_tags: [tagId],
        excluded_tags: Array.isArray(excludedTags)
          ? excludedTags
          : [excludedTags],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('name', { ascending: true, nullsFirst: false });

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
    return getGroupData(wsId, tagId, {
      q,
      pageSize,
      excludedTags,
      retry: false,
    });
  }

  return { data, count } as unknown as { data: UserGroup[]; count: number };
}

async function getExcludedGroupTags(wsId: string, tagId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .rpc(
      'get_possible_excluded_tags',
      {
        _ws_id: wsId,
        included_tags: [tagId],
      },
      {
        count: 'exact',
      }
    )
    .select('id, name, amount')
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroupTag[]; count: number };
}
