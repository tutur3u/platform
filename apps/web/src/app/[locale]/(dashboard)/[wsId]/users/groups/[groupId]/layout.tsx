import {
  Calendar,
  ChartColumn,
  ClipboardList,
  FileUser,
  UserCheck,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import LinkButton from '@tuturuuu/ui/custom/education/modules/link-button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getUserGroupMemberships, verifyGroupAccess } from '../utils';
import SelectGroupGateway from './select-group-gateway';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id, groupId } = await params;
  const wsId = await normalizeWorkspaceId(id);

  const { containsPermission } = await getPermissions({ wsId });
  const hasManageUsersPermission = containsPermission('manage_users');

  if (groupId === '~') {
    const accessibleGroupIds = hasManageUsersPermission
      ? null
      : await getUserGroupMemberships(wsId);
    return (
      <SelectGroupGateway wsId={wsId} accessibleGroupIds={accessibleGroupIds} />
    );
  }

  if (!hasManageUsersPermission) {
    await verifyGroupAccess(wsId, groupId);
  }

  const t = await getTranslations();
  const group = await getData(wsId, groupId);

  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canViewUserGroupsScores = containsPermission('view_user_groups_scores');
  const canApproveReports = containsPermission('approve_reports');
  const canApprovePosts = containsPermission('approve_posts');
  const canViewRequests = canApproveReports || canApprovePosts;

  // Get rejected counts for badge
  const rejectedCount = canViewRequests
    ? await getRejectedCount(wsId, groupId, canApproveReports, canApprovePosts)
    : 0;

  const commonHref = `/${wsId}/users/groups/${groupId}`;

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
            <LinkButton
              href={commonHref}
              title={t('infrastructure-tabs.overview')}
              icon={<Calendar className="h-5 w-5" />}
              className="border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20"
            />
            <LinkButton
              href={`${commonHref}/schedule`}
              title={t('ws-user-group-details.schedule')}
              icon={<Calendar className="h-5 w-5" />}
              className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20"
            />
            {canCheckUserAttendance && (
              <LinkButton
                href={`${commonHref}/attendance`}
                title={t('ws-user-group-details.attendance')}
                icon={<UserCheck className="h-5 w-5" />}
                className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20"
              />
            )}
            <LinkButton
              href={`${commonHref}/reports`}
              title={t('ws-user-group-details.reports')}
              icon={<FileUser className="h-5 w-5" />}
              className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20"
            />
            {canViewRequests && (
              <LinkButton
                href={`${commonHref}/requests`}
                title={t('ws-user-group-details.requests')}
                icon={<ClipboardList className="h-5 w-5" />}
                className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20"
                badge={rejectedCount}
              />
            )}
            {canViewUserGroupsScores && (
              <LinkButton
                href={`${commonHref}/indicators`}
                title={t('ws-user-group-details.metrics')}
                icon={<ChartColumn className="h-5 w-5" />}
                className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20"
              />
            )}
          </div>
        }
      />
      <Separator className="my-4" />
      {children}
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
  if (!data) {
    notFound();
  }
  return data as UserGroup;
}

async function getRejectedCount(
  wsId: string,
  groupId: string,
  canApproveReports: boolean,
  canApprovePosts: boolean
): Promise<number> {
  const supabase = await createClient();
  let count = 0;

  if (canApproveReports) {
    const { count: reportCount } = await supabase
      .from('external_user_monthly_reports')
      .select('id, user:workspace_users!user_id!inner(ws_id)', {
        count: 'exact',
        head: true,
      })
      .eq('user.ws_id', wsId)
      .eq('group_id', groupId)
      .eq('report_approval_status', 'REJECTED');
    count += reportCount ?? 0;
  }

  if (canApprovePosts) {
    const { count: postCount } = await supabase
      .from('user_group_posts')
      .select('id, workspace_user_groups!inner(ws_id)', {
        count: 'exact',
        head: true,
      })
      .eq('workspace_user_groups.ws_id', wsId)
      .eq('group_id', groupId)
      .eq('post_approval_status', 'REJECTED');
    count += postCount ?? 0;
  }

  return count;
}
