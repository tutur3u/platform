import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import GroupReportsClient from './client';

export const metadata: Metadata = {
  title: 'Reports',
  description: 'Manage Reports in the Group area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
}

export default async function UserGroupDetailsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId }) => {
        const t = await getTranslations();
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;
        const canViewUserGroupsReports = containsPermission(
          'view_user_groups_reports'
        );
        if (!canViewUserGroupsReports) {
          notFound();
        }
        const group = await getData(wsId, groupId);

        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );
        const canApproveReports = containsPermission('approve_reports');
        const canCreateReports = containsPermission(
          'create_user_groups_reports'
        );
        const canUpdateReports = containsPermission(
          'update_user_groups_reports'
        );
        const canDeleteReports = containsPermission(
          'delete_user_groups_reports'
        );

        return (
          <GroupReportsClient
            wsId={wsId}
            groupId={groupId}
            groupNameFallback={group.name || t('ws-user-groups.singular')}
            canCheckUserAttendance={canCheckUserAttendance}
            canApproveReports={canApproveReports}
            canCreateReports={canCreateReports}
            canUpdateReports={canUpdateReports}
            canDeleteReports={canDeleteReports}
          />
        );
      }}
    </WorkspaceWrapper>
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
