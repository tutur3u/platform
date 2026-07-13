import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import { GroupOverviewSkeleton } from './_components/card-skeletons';
import {
  GroupOverview,
  type GroupOverviewSearchParams,
} from './_components/group-overview';

export const metadata: Metadata = {
  title: 'Group Details',
  description:
    'Manage Group Details in the Groups area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
  searchParams: Promise<GroupOverviewSearchParams>;
}

export default function UserGroupDetailsPage(props: Props) {
  return (
    <Suspense fallback={<GroupOverviewSkeleton />}>
      <GroupOverviewAccess {...props} />
    </Suspense>
  );
}

async function GroupOverviewAccess({ params, searchParams }: Props) {
  await connection();

  return (
    <WorkspaceWrapper params={params} fallback={<GroupOverviewSkeleton />}>
      {async ({ wsId, groupId }) => {
        const permissions = await getContactsWorkspacePermissions(wsId);
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
        const canViewAuditLogs = containsPermission(
          'manage_workspace_audit_logs'
        );

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

        return (
          <>
            <GroupOverview
              wsId={wsId}
              groupId={groupId}
              searchParams={searchParams}
              canViewPersonalInfo={canViewPersonalInfo}
              canViewPublicInfo={canViewPublicInfo}
              canUpdateUserGroups={canUpdateUserGroups}
              canViewAuditLogs={canViewAuditLogs}
              canViewUserGroupsPosts={canViewUserGroupsPosts}
              canCreateUserGroupsPosts={canCreateUserGroupsPosts}
              canUpdateUserGroupsPosts={canUpdateUserGroupsPosts}
              canDeleteUserGroupsPosts={canDeleteUserGroupsPosts}
            />
            <Separator className="my-5" />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
