import {
  CalendarIcon,
  ChartColumn,
  FileUser,
  UserCheck,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import 'dayjs/locale/vi';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import GroupIndicatorsManager from './group-indicators-manager';

export const metadata: Metadata = {
  title: 'Indicators',
  description:
    'Manage Indicators in the Group area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
}

export default async function UserGroupIndicatorsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId }) => {
        // Layout handles group selection when groupId is '~'
        if (groupId === '~') {
          return null;
        }

        const t = await getTranslations();

        const { containsPermission } = await getPermissions({
          wsId,
        });
        const canViewUserGroupsScores = containsPermission(
          'view_user_groups_scores'
        );
        if (!canViewUserGroupsScores) {
          notFound();
        }
        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );
        const canCreateUserGroupsScores = containsPermission(
          'create_user_groups_scores'
        );
        const canUpdateUserGroupsScores = containsPermission(
          'update_user_groups_scores'
        );
        const canDeleteUserGroupsScores = containsPermission(
          'delete_user_groups_scores'
        );

        const group = await getData(wsId, groupId);
        const indicators = await getIndicators(groupId);
        const groupIndicators = await getGroupIndicators(groupId);
        const { data: users } = await getUserData(wsId, groupId);

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
                  <Link href={`/${wsId}/users/groups/${groupId}`}>
                    <Button
                      type="button"
                      variant="secondary"
                      className={cn(
                        'border font-semibold max-sm:w-full',
                        'border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20'
                      )}
                    >
                      <CalendarIcon className="h-5 w-5" />
                      {t('infrastructure-tabs.overview')}
                    </Button>
                  </Link>
                  <Link href={`/${wsId}/users/groups/${groupId}/schedule`}>
                    <Button
                      type="button"
                      variant="secondary"
                      className={cn(
                        'border font-semibold max-sm:w-full',
                        'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                      )}
                    >
                      <CalendarIcon className="h-5 w-5" />
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
                  <Button
                    type="button"
                    variant="secondary"
                    className={cn(
                      'border font-semibold max-sm:w-full',
                      'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20'
                    )}
                    disabled
                  >
                    <ChartColumn className="h-5 w-5" />
                    {t('ws-user-group-details.metrics')}
                  </Button>
                </div>
              }
              createTitle={t('ws-user-groups.add_user')}
              createDescription={t('ws-user-groups.add_user_description')}
            />
            <Separator className="my-4" />
            <GroupIndicatorsManager
              wsId={wsId}
              groupId={groupId}
              groupName={group.name}
              users={users}
              initialGroupIndicators={groupIndicators}
              initialUserIndicators={indicators}
              canCreateUserGroupsScores={canCreateUserGroupsScores}
              canUpdateUserGroupsScores={canUpdateUserGroupsScores}
              canDeleteUserGroupsScores={canDeleteUserGroupsScores}
            />
          </>
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

async function getGroupIndicators(groupId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('healthcare_vitals')
    .select('id, name, factor, unit')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return data;
}

async function getIndicators(groupId: string) {
  const supabase = await createClient();

  const { data: rawData, error } = await supabase
    .from('user_indicators')
    .select(`
    user_id, 
    indicator_id, 
    value,
    healthcare_vitals!inner(group_id)
  `)
    .eq('healthcare_vitals.group_id', groupId);

  if (error) throw error;
  if (!rawData) return [];

  const data = rawData.map((d) => ({
    user_id: d.user_id,
    indicator_id: d.indicator_id,
    value: d.value,
  }));

  return data;
}

async function getUserData(wsId: string, groupId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: [groupId],
        excluded_groups: [],
        search_query: '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  const { data, error, count } = await queryBuilder;
  if (error) throw error;
  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
}
