import { getUserColumns } from '../../database/columns';
import { Filter } from '../../filters';
import ExternalGroupMembers from './external-group-members';
import GroupMemberForm from './form';
import PostsClient from './posts-client';
import GroupSchedule from './schedule';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@ncthub/supabase/next/server';
import { UserGroup } from '@ncthub/types/primitives/UserGroup';
import { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import { WorkspaceUserField } from '@ncthub/types/primitives/WorkspaceUserField';
import { Button } from '@ncthub/ui/button';
import FeatureSummary from '@ncthub/ui/custom/feature-summary';
import {
  Box,
  Calendar,
  ChartColumn,
  FileUser,
  MinusCircle,
  UserCheck,
} from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import { cn } from '@ncthub/utils/format';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
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
  const { data: posts, count: postsCount } = await getGroupPosts(groupId);
  const { data: linkedProducts, count: lpCount } =
    await getLinkedProducts(groupId);

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
        title={
          <>
            <h1 className="w-full text-2xl font-bold">
              {group.name || t('ws-user-groups.singular')}
            </h1>
            <Separator className="my-2" />
          </>
        }
        description={
          <>
            <div className="grid flex-wrap gap-2 md:flex">
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold max-sm:w-full',
                  'border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20'
                )}
                disabled
              >
                <Calendar className="h-5 w-5" />
                {t('infrastructure-tabs.overview')}
              </Button>
              <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                  )}
                >
                  <Calendar className="h-5 w-5" />
                  {t('ws-user-group-details.schedule')}
                </Button>
              </Link>
              <Link href={`/${wsId}/users/groups/${groupId}/attendance`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                  )}
                >
                  <UserCheck className="h-5 w-5" />
                  {t('ws-user-group-details.attendance')}
                </Button>
              </Link>
              <Link href={`/${wsId}/users/groups/${groupId}/reports`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20'
                  )}
                >
                  <FileUser className="h-5 w-5" />
                  {t('ws-user-group-details.reports')}
                </Button>
              </Link>
              <Link href={`/${wsId}/users/groups/${groupId}/indicators`}>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    'border font-semibold max-sm:w-full',
                    'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20'
                  )}
                >
                  <ChartColumn className="h-5 w-5" />
                  {t('ws-user-group-details.metrics')}
                </Button>
              </Link>
            </div>
          </>
        }
        createTitle={t('ws-user-groups.add_user')}
        createDescription={t('ws-user-groups.add_user_description')}
        form={<GroupMemberForm wsId={wsId} groupId={groupId} />}
      />
      <Separator className="my-4" />
      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
        {/* <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-4 opacity-50 md:flex-row md:items-start"> */}
        {excludedUserGroups.length ? (
          <div className="border-border bg-foreground/5 flex flex-col rounded-lg border p-4">
            <div className="mb-2 text-xl font-semibold">
              {t('ws-roles.members')}
            </div>

            <ExternalGroupMembers
              wsId={wsId}
              totalUsers={usersCount}
              groups={excludedUserGroups}
            />
          </div>
        ) : null}

        <div className="border-border bg-foreground/5 flex flex-col rounded-lg border p-4">
          <div className="mb-2 text-xl font-semibold">
            {t('ws-user-group-details.schedule')}
          </div>
          <GroupSchedule wsId={wsId} groupId={groupId} />
        </div>

        <div className="border-border bg-foreground/5 flex flex-col rounded-lg border p-4">
          <PostsClient
            wsId={wsId}
            groupId={groupId}
            posts={posts}
            count={postsCount}
          />
        </div>

        {lpCount ? (
          <div className="border-border bg-foreground/5 flex flex-col rounded-lg border p-4">
            <div className="mb-2 text-xl font-semibold">
              {t('user-data-table.linked_products')}
              {!!lpCount && ` (${lpCount})`}
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {linkedProducts.map((product) => (
                <div
                  key={product.id}
                  className="bg-background flex items-center rounded-lg border p-2 md:p-4"
                >
                  <Box className="mr-2 h-8 w-8" />
                  <div>
                    <div className="text-lg font-semibold">{product.name}</div>
                    {product.description && (
                      <div className="text-sm">{product.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {/* <div className="border-border bg-foreground/5 flex flex-col rounded-lg border p-4">
          <div className="text-xl font-semibold">
            {t('user-group-data-table.special_users')}
          </div>
        </div> */}
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
          />,
        ]}
        defaultVisibility={{
          id: false,
          gender: false,
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
    .from('workspace_user_groups_users')
    .select('...workspace_users!inner(*)', {
      count: 'exact',
    })
    .eq('group_id', groupId);

  if (q) queryBuilder.ilike('workspace_users.display_name', `%${q}%`);

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

async function getLinkedProducts(groupId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('user_group_linked_products')
    .select('...workspace_products(id, name, description)', {
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
    .order('amount', { ascending: false })
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}
