import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import {
  mapUserGroupActivityRowsToEvents,
  type UserGroupActivityActionFilter,
  type UserGroupActivityRawRow,
  type UserGroupActivityResourceTypeFilter,
} from './normalize';

const UserGroupActivityActionSchema = z.enum([
  'all',
  'created',
  'updated',
  'deleted',
  'archived',
  'reactivated',
  'reordered',
  'uploaded',
  'removed',
  'restored',
  'role_updated',
]);

const UserGroupActivityResourceTypeSchema = z.enum([
  'all',
  'group',
  'membership',
  'tag',
  'default_included_group',
  'post',
  'post_log',
  'post_check',
  'attendance',
  'linked_product',
  'metric',
  'metric_category',
  'metric_category_link',
  'student_metric_value',
  'monthly_report',
  'monthly_report_log',
  'feedback',
  'course_module',
  'course_module_group',
  'course_module_group_order',
  'course_module_order',
  'resource',
]);

function resolveActionFilter(value?: string): UserGroupActivityActionFilter {
  return UserGroupActivityActionSchema.catch('all').parse(value);
}

function resolveResourceTypeFilter(
  value?: string
): UserGroupActivityResourceTypeFilter {
  return UserGroupActivityResourceTypeSchema.catch('all').parse(value);
}

function toCount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function listUserGroupActivityEventsForRange({
  wsId,
  start,
  end,
  groupId,
  resourceType,
  action,
  affectedUserQuery,
  actorQuery,
  query,
  offset = 0,
  limit = 100,
}: {
  wsId: string;
  start: string;
  end: string;
  groupId?: string;
  resourceType?: string;
  action?: string;
  affectedUserQuery?: string;
  actorQuery?: string;
  query?: string;
  offset?: number;
  limit?: number;
}) {
  const sbAdmin = await createAdminClient();
  const resolvedResourceType = resolveResourceTypeFilter(resourceType);
  const resolvedAction = resolveActionFilter(action);
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('list_user_group_activity_logs', {
      p_ws_id: wsId,
      p_start: new Date(start).toISOString(),
      p_end: new Date(end).toISOString(),
      p_group_id: groupId || undefined,
      p_resource_type: resolvedResourceType,
      p_action: resolvedAction,
      p_affected_user_query: affectedUserQuery?.trim() || undefined,
      p_actor_query: actorQuery?.trim() || undefined,
      p_query: query?.trim() || undefined,
      p_limit: limit,
      p_offset: offset,
    });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as UserGroupActivityRawRow[];

  return {
    count: toCount(rows[0]?.total_count),
    data: mapUserGroupActivityRowsToEvents(rows),
  };
}
