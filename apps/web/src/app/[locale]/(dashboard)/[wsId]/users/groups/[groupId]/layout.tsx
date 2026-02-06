import { Calendar, ChartColumn, FileUser, UserCheck } from '@tuturuuu/icons';
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
import { verifyGroupAccess } from '../utils';
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

  if (groupId === '~') {
    return <SelectGroupGateway wsId={wsId} />;
  }

  const { containsPermission } = await getPermissions({ wsId });
  const hasManageUsersPermission = containsPermission('manage_users');

  if (!hasManageUsersPermission) {
    await verifyGroupAccess(wsId, groupId);
  }

  const t = await getTranslations();
  const group = await getData(wsId, groupId);

  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canViewUserGroupsScores = containsPermission('view_user_groups_scores');

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
