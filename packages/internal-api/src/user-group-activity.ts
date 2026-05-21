import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from './client';

export interface UserGroupActivityEventResponse {
  auditRecordId: number;
  tableName: string | null;
  action:
    | 'created'
    | 'updated'
    | 'deleted'
    | 'archived'
    | 'reactivated'
    | 'reordered'
    | 'uploaded'
    | 'removed'
    | 'restored'
    | 'role_updated';
  resourceType:
    | 'group'
    | 'membership'
    | 'tag'
    | 'default_included_group'
    | 'post'
    | 'post_log'
    | 'post_check'
    | 'attendance'
    | 'linked_product'
    | 'metric'
    | 'metric_category'
    | 'metric_category_link'
    | 'student_metric_value'
    | 'monthly_report'
    | 'monthly_report_log'
    | 'feedback'
    | 'course_module'
    | 'course_module_group'
    | 'course_module_group_order'
    | 'course_module_order'
    | 'resource';
  resourceId: string | null;
  resourceLabel: string | null;
  summary: string;
  changedFields: string[];
  fieldChanges: Array<{
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }>;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  group: {
    id: string | null;
    name: string | null;
  };
  affectedUser: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
  actor: {
    authUid: string | null;
    workspaceUserId: string | null;
    id: string | null;
    name: string | null;
    email: string | null;
  };
  occurredAt: string;
}

export interface UserGroupActivityLogsResponse {
  data: UserGroupActivityEventResponse[];
  count: number;
}

export interface UserGroupActivityLogQuery extends InternalApiQuery {
  start: string;
  end: string;
  groupId?: string;
  resourceType?: UserGroupActivityEventResponse['resourceType'] | 'all';
  action?: UserGroupActivityEventResponse['action'] | 'all';
  affectedUserQuery?: string;
  actorQuery?: string;
  query?: string;
  offset?: number;
  limit?: number;
}

export async function listUserGroupActivityLogs(
  workspaceId: string,
  query: UserGroupActivityLogQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<UserGroupActivityLogsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/activity-logs`,
    {
      cache: 'no-store',
      query,
    }
  );
}
