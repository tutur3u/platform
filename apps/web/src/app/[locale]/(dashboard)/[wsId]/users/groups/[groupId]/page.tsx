import { CalendarPlus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
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
        const t = await getTranslations();
        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();
        const { containsPermission } = permissions;

        const canViewUserGroups = containsPermission('view_user_groups');
        if (!canViewUserGroups) {
          notFound();
        }

        const canViewPersonalInfo = containsPermission(
          'view_users_private_info'
        );
        const canViewPublicInfo = containsPermission('view_users_public_info');
        const canUpdateUserGroups = containsPermission('update_user_groups');

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
