import { createClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
        if (groupId === '~') {
          return null;
        }

        const { containsPermission } = await getPermissions({
          wsId,
        });
        const canViewUserGroupsScores = containsPermission(
          'view_user_groups_scores'
        );
        if (!canViewUserGroupsScores) {
          notFound();
        }
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
