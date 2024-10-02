import { getUserColumns } from '../../database/columns';
import { UserDatabaseFilter } from '../../filters';
import GroupMemberForm from './form';
import PostsClient from './posts-client';
import { CustomDataTable } from '@/components/custom-data-table';
import { UserGroup } from '@/types/primitives/UserGroup';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { MinusCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  excludedGroups?: string | string[];
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function UserGroupDetailsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId, groupId } = await params;

  const group = await getData(wsId, groupId);

  const { data: rawUsers, count: usersCount } = await getUserData(
    wsId,
    groupId,
    await searchParams
  );

  const { data: extraFields } = await getUserFields(wsId);
  const { data: posts } = await getGroupPosts(groupId);

  const { data: excludedUserGroups } = await getExcludedUserGroups(
    wsId,
    groupId
  );

  const users = rawUsers.map((u) => ({
    ...u,
    href: `/${wsId}/users/database/${u.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={group.name || t('ws-user-groups.plural')}
        singularTitle={group.name || t('ws-user-groups.singular')}
        description={t('ws-user-groups.description')}
        createTitle={t('ws-user-groups.add_user')}
        createDescription={t('ws-user-groups.add_user_description')}
        form={<GroupMemberForm wsId={wsId} groupId={groupId} />}
      />
      <Separator className="my-4" />
      <div className="grid w-full grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="border-border bg-foreground/5 grid rounded-lg border p-4 pb-0">
          <PostsClient wsId={wsId} groupId={groupId} posts={posts} />
        </div>
        <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 opacity-50 md:flex-row md:items-start">
          {/* <div className="text-xl font-semibold">Attendance Calendar</div> */}
        </div>
      </div>
      <Separator className="my-4" />
      <CustomDataTable
        data={users}
        namespace="user-data-table"
        columnGenerator={getUserColumns}
        extraColumns={extraFields}
        extraData={{ locale, wsId, groupId }}
        count={usersCount}
        filters={[
          <UserDatabaseFilter
            key="excluded-user-groups-filter"
            tag="excludedGroups"
            title={t('user-data-table.excluded_groups')}
            icon={<MinusCircle className="mr-2 h-4 w-4" />}
            options={excludedUserGroups.map((group) => ({
              label: group.name || 'No name',
              value: group.id,
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

          // Extra columns
          ...Object.fromEntries(extraFields.map((field) => [field.id, false])),
        }}
      />
    </>
  );
}

async function getData(wsId: string, groupId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as UserGroup;
}

async function getUserData(
  wsId: string,
  groupId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [groupId],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

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
    return getUserData(wsId, groupId, {
      q,
      pageSize,
      excludedGroups,
      retry: false,
    });
  }

  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
}

async function getUserFields(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_fields')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUserField[]; count: number };
}

async function getGroupPosts(groupId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('user_group_posts')
    .select('*', {
      count: 'exact',
    })
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count };
}

async function getExcludedUserGroups(wsId: string, groupId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_possible_excluded_groups',
      {
        _ws_id: wsId,
        included_groups: [groupId],
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
