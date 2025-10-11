import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  Calendar,
  CalendarPlus,
  ChartColumn,
  FileUser,
  UserCheck,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import GroupMembers from './group-members';
import LinkedProductsClient from './linked-products-client';
import PostsClient from './posts-client';
import GroupSchedule from './schedule';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';

export const metadata: Metadata = {
  title: 'Group Details',
  description:
    'Manage Group Details in the Groups area of your Tuturuuu workspace.',
};

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

interface GroupMember extends WorkspaceUser {
  role?: string | null;
  isGuest?: boolean;
}

interface PermissionFlags {
  canViewPersonalInfo: boolean;
  canViewPublicInfo: boolean;
  canCheckUserAttendance: boolean;
}

interface GroupUserQueryResult {
  workspace_users: WorkspaceUser;
  role: string | null;
}

export default async function UserGroupDetailsPage({
  params,
  // searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId: id, groupId } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  const group = await getData(wsId, groupId);

  // Get permissions first to compute access flags
  const { containsPermission } = await getPermissions({ wsId });

  const canViewPersonalInfo: boolean = containsPermission(
    'view_users_private_info'
  );
  const canViewPublicInfo: boolean = containsPermission(
    'view_users_public_info'
  );
  const canCheckUserAttendance: boolean = containsPermission(
    'check_user_attendance'
  );

  // Fetch group members data for the GroupMembers component
  const MEMBERS_PAGE_SIZE = 10;
  const groupMembersData = await getGroupMembersData(
    groupId,
    MEMBERS_PAGE_SIZE,
    {
      canViewPersonalInfo,
      canViewPublicInfo,
      canCheckUserAttendance,
    }
  );

  const { data: posts, count: postsCount } = await getGroupPosts(groupId);
  const { data: linkedProducts, count: lpCount } =
    await getLinkedProducts(groupId);

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="w-full font-bold text-2xl">
              {group.name || t('ws-user-groups.singular')}
            </h1>
            <Separator className="my-2" />
          </>
        }
        description={
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
            {canCheckUserAttendance && (
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
            )}
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
        }
      />
      <Separator className="my-4" />
      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
        <GroupMembers
          wsId={wsId}
          groupId={groupId}
          initialData={groupMembersData}
          pageSize={MEMBERS_PAGE_SIZE}
          canViewPersonalInfo={canViewPersonalInfo}
          canViewPublicInfo={canViewPublicInfo}
        />

        <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
          <div className="mb-2 flex flex-row items-center justify-between">
            <div className="font-semibold text-xl">
              {t('ws-user-group-details.schedule')}
            </div>
            <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
              <Button variant="default">
                <CalendarPlus className="h-5 w-5" />
                {t('ws-user-group-details.modify_schedule')}
              </Button>
            </Link>
          </div>

          <GroupSchedule wsId={wsId} groupId={groupId} />
        </div>

        <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
          <PostsClient
            wsId={wsId}
            groupId={groupId}
            posts={posts}
            count={postsCount}
          />
        </div>

        <LinkedProductsClient
          wsId={wsId}
          groupId={groupId}
          initialLinkedProducts={linkedProducts}
          initialCount={lpCount || 0}
        />
      </div>
      <Separator className="my-4" />
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

async function getGroupPosts(groupId: string) {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from('user_group_posts')
    .select('*', { count: 'exact' })
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { data, count };
}

async function getLinkedProducts(groupId: string) {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from('user_group_linked_products')
    .select(
      'warehouse_id, unit_id, ...workspace_products(id, name, description)',
      { count: 'exact' }
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { data: data || [], count };
}

async function getGroupMembersData(
  groupId: string,
  PAGE_SIZE: number,
  permissions: PermissionFlags
): Promise<GroupMember[]> {
  const supabase = await createClient();

  // Build dynamic select query based on permissions
  const baseFields = 'id';
  const publicFields = permissions.canViewPublicInfo ? ', birthday, gender, display_name, avatar_url, full_name' : '';
  const personalFields = permissions.canViewPersonalInfo ? ', email, phone' : '';

  // Build the complete select query string
  const selectQuery = `workspace_users(${baseFields}${publicFields}${personalFields}), role`;

  // Fetch all users in the group with their roles
  const { data: groupUsers, error: groupError } = await supabase
    .from('workspace_user_groups_users')
    .select(selectQuery)
    .eq('group_id', groupId)
    .range(0, PAGE_SIZE - 1);

  if (groupError) throw groupError;
  if (!groupUsers || !Array.isArray(groupUsers)) return [];

  // Check guest status for each user
  const membersWithGuestStatus = await Promise.all(
    groupUsers.map(async (user) => {
      // Type assertion needed due to Supabase typing limitations
      const typedUser = user as unknown as GroupUserQueryResult;
      const { data: isGuest } = await supabase.rpc('is_user_guest', {
        user_uuid: typedUser.workspace_users.id,
      });

      return {
        ...typedUser.workspace_users,
        role: typedUser.role,
        isGuest: isGuest || false,
      } as GroupMember;
    })
  );

  return membersWithGuestStatus;
}

// async function getExcludedUserGroups(wsId: string, groupId: string) {
//   const supabase = await createClient();
//   const { data, error, count } = await supabase
//     .rpc(
//       'get_possible_excluded_groups',
//       { _ws_id: wsId, included_groups: [groupId] },
//       { count: 'exact' }
//     )
//     .select('id, name, amount')
//     .order('amount', { ascending: false })
//     .order('name');

//   if (error) throw error;
//   return { data, count } as { data: UserGroup[]; count: number };
// }
