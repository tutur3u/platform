import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  fetchRequireAttentionUserIds,
  withRequireAttentionFlag,
} from '@/lib/require-attention-users';
import { getGroupRow } from '@/lib/user-groups/server-data';
import GroupIndicatorsManager from './group-indicators-manager';
import type { GroupIndicator, MetricCategory } from './types';

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
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, groupId }) => {
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;
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

        // Independent reads — run in parallel to collapse the waterfall.
        const [group, indicators, groupIndicators, metricCategories, userData] =
          await Promise.all([
            getGroupRow(wsId, groupId),
            getIndicators(groupId),
            getGroupIndicators(groupId),
            getMetricCategories(wsId),
            getUserData(wsId, groupId),
          ]);
        if (!group) notFound();
        const { data: users } = userData;

        return (
          <GroupIndicatorsManager
            wsId={wsId}
            groupId={groupId}
            groupName={group.name}
            users={users}
            initialGroupIndicators={groupIndicators}
            initialUserIndicators={indicators}
            initialMetricCategories={metricCategories}
            canCreateUserGroupsScores={canCreateUserGroupsScores}
            canUpdateUserGroupsScores={canUpdateUserGroupsScores}
            canDeleteUserGroupsScores={canDeleteUserGroupsScores}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}

function mapMetricCategories(
  metricCategoriesByMetricId: Map<string, MetricCategory[]>,
  metricId: string
) {
  return metricCategoriesByMetricId.get(metricId) ?? [];
}

function groupMetricCategoriesByMetricId(
  metricCategoryLinks:
    | {
        metric_id: string;
        user_group_metric_categories: MetricCategory | MetricCategory[] | null;
      }[]
    | null
    | undefined
) {
  const categoriesByMetricId = new Map<string, MetricCategory[]>();

  for (const link of metricCategoryLinks ?? []) {
    const categories = Array.isArray(link.user_group_metric_categories)
      ? link.user_group_metric_categories
      : link.user_group_metric_categories
        ? [link.user_group_metric_categories]
        : [];

    categoriesByMetricId.set(link.metric_id, [
      ...(categoriesByMetricId.get(link.metric_id) ?? []),
      ...categories,
    ]);
  }

  return categoriesByMetricId;
}

async function getGroupIndicators(groupId: string) {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('user_group_metrics')
    .select(`
      id,
      name,
      factor,
      unit,
      is_weighted
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  const metricIds = data.map((indicator) => indicator.id);
  const { data: metricCategoryLinks, error: metricCategoryLinksError } =
    metricIds.length > 0
      ? await sbAdmin
          .schema('private')
          .from('user_group_metric_category_links')
          .select(`
            metric_id,
            user_group_metric_categories(id, name, description)
          `)
          .in('metric_id', metricIds)
      : { data: [], error: null };

  if (metricCategoryLinksError) throw metricCategoryLinksError;

  const metricCategoriesByMetricId =
    groupMetricCategoriesByMetricId(metricCategoryLinks);

  return data.map(
    (indicator): GroupIndicator => ({
      id: indicator.id,
      name: indicator.name,
      factor: indicator.factor,
      unit: indicator.unit,
      is_weighted: indicator.is_weighted,
      categories: mapMetricCategories(metricCategoriesByMetricId, indicator.id),
    })
  );
}

async function getMetricCategories(wsId: string) {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .schema('private')
    .from('user_group_metric_categories')
    .select('id, name, description')
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return data satisfies MetricCategory[];
}

async function getIndicators(groupId: string) {
  const sbAdmin = await createAdminClient();

  const { data: rawData, error } = await sbAdmin
    .from('user_indicators')
    .select(`
    user_id,
    indicator_id,
    value,
    user_group_metrics!inner(group_id)
  `)
    .eq('user_group_metrics.group_id', groupId);

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
  const sbAdmin = await createAdminClient();

  const queryBuilder = sbAdmin
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

  const users = (data ?? []) as unknown as WorkspaceUser[];
  const requireAttentionUserIds = await fetchRequireAttentionUserIds(sbAdmin, {
    wsId,
    userIds: users.map((user) => user.id),
    groupId,
  });

  return {
    data: withRequireAttentionFlag(users, requireAttentionUserIds),
    count,
  } as { data: WorkspaceUser[]; count: number };
}
