import {
  Calendar,
  CalendarPlus,
  ChartColumn,
  FileUser,
  UserCheck,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { verifyGroupAccess } from '../utils';
import GroupMembers from './group-members';
import LinkedProductsClient from './linked-products-client';
import PostsClient from './posts-client';
import GroupSchedule from './schedule';

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

export default async function UserGroupDetailsPage({
  params,
  // searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId }) => {
        // Layout handles group selection when groupId is '~'
        if (groupId === '~') {
          return null;
        }

        const t = await getTranslations();

        // Get permissions first to compute access flags
        const { containsPermission } = await getPermissions({ wsId });

        const hasManageUsersPermission = containsPermission('manage_users');

        // Group-related permissions from migration
        const canViewUserGroups = containsPermission('view_user_groups');

        if (!canViewUserGroups) {
          console.error('User lacks permission to view user groups');
          notFound();
        }
        const group = await getData(wsId, groupId, hasManageUsersPermission);

        // User Information Permissions
        const canViewPersonalInfo = containsPermission(
          'view_users_private_info'
        );
        const canViewPublicInfo = containsPermission('view_users_public_info');

        // Feature Summary Navigation Button Permissions
        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );
        const canViewUserGroupsScores = containsPermission(
          'view_user_groups_scores'
        );
        const canUpdateUserGroups = containsPermission('update_user_groups');

        // Posts Permissions
        const canViewUserGroupsPosts = containsPermission(
          'view_user_groups_posts'
        );
        const canCreateUserGroupsPosts = containsPermission(
          'create_user_groups_posts'
        );
        const canUpdateUserGroupsPosts = containsPermission(
          'update_user_groups_posts'
        );
        const canDeleteUserGroupsPosts = containsPermission(
          'delete_user_groups_posts'
        );

        const MEMBERS_PAGE_SIZE = 10;

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
                  {canViewUserGroupsScores && (
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
                  )}
                </div>
              }
            />
            <Separator className="my-4" />
            <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
              <GroupMembers
                wsId={wsId}
                groupId={groupId}
                pageSize={MEMBERS_PAGE_SIZE}
                canViewPersonalInfo={canViewPersonalInfo}
                canViewPublicInfo={canViewPublicInfo}
                canUpdateUserGroups={canUpdateUserGroups}
              />

              <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
                <div className="mb-2 flex flex-row items-center justify-between">
                  <div className="font-semibold text-xl">
                    {t('ws-user-group-details.schedule')}
                  </div>
                  {canUpdateUserGroups && (
                    <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
                      <Button variant="default">
                        <CalendarPlus className="h-5 w-5" />
                        {t('ws-user-group-details.modify_schedule')}
                      </Button>
                    </Link>
                  )}
                </div>

                <GroupSchedule wsId={wsId} groupId={groupId} />
              </div>

              <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
                {canViewUserGroupsPosts && (
                  <PostsClient
                    wsId={wsId}
                    groupId={groupId}
                    canUpdatePosts={canUpdateUserGroupsPosts}
                    canCreatePosts={canCreateUserGroupsPosts}
                    canDeletePosts={canDeleteUserGroupsPosts}
                    canViewPosts={canViewUserGroupsPosts}
                  />
                )}
              </div>

              <LinkedProductsClient
                wsId={wsId}
                groupId={groupId}
                canUpdateLinkedProducts={canUpdateUserGroups}
              />
            </div>
            <Separator className="my-4" />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData(wsId: string, groupId: string, hasManageUsersPermission = false) {
  const supabase = await createClient();

  // Restrict visibility: users only see groups they're a member of.
  if (!hasManageUsersPermission){
    await verifyGroupAccess(wsId, groupId);
  }


  const { data, error } = await supabase
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', groupId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    console.error(`Group ${groupId} not found in workspace ${wsId}`);
    notFound();
  }
  return data as UserGroup;
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
