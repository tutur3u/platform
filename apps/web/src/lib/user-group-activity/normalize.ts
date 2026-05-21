import {
  humanizeAuditField,
  normalizeAuditFieldValue,
} from '@/lib/workspace-user-audit/normalize';

export type UserGroupActivityAction =
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

export type UserGroupActivityActionFilter = 'all' | UserGroupActivityAction;

export type UserGroupActivityResourceType =
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

export type UserGroupActivityResourceTypeFilter =
  | 'all'
  | UserGroupActivityResourceType;

export type UserGroupActivityRawRecord = Record<string, unknown>;

export interface UserGroupActivityRawRow {
  audit_record_id: number;
  table_name: string | null;
  action: UserGroupActivityAction;
  resource_type: UserGroupActivityResourceType;
  occurred_at: string;
  group_id: string | null;
  group_name: string | null;
  resource_id: string | null;
  resource_label: string | null;
  affected_user_id: string | null;
  affected_user_name: string | null;
  affected_user_email: string | null;
  actor_auth_uid: string | null;
  actor_workspace_user_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  changed_fields: string[] | null;
  before: UserGroupActivityRawRecord | null;
  after: UserGroupActivityRawRecord | null;
  total_count?: number | null;
}

export interface UserGroupActivityIdentity {
  id: string | null;
  name: string | null;
  email: string | null;
}

export interface UserGroupActivityFieldChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface UserGroupActivityEvent {
  auditRecordId: number;
  tableName: string | null;
  action: UserGroupActivityAction;
  resourceType: UserGroupActivityResourceType;
  resourceId: string | null;
  resourceLabel: string | null;
  summary: string;
  changedFields: string[];
  fieldChanges: UserGroupActivityFieldChange[];
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  group: {
    id: string | null;
    name: string | null;
  };
  affectedUser: UserGroupActivityIdentity | null;
  actor: UserGroupActivityIdentity & {
    authUid: string | null;
    workspaceUserId: string | null;
  };
  occurredAt: string;
}

const SUMMARY_HIDDEN_FIELDS = new Set([
  'created_at',
  'deleted_at',
  'id',
  'updated_at',
  'ws_id',
]);

const RESOURCE_LABELS: Record<UserGroupActivityResourceType, string> = {
  attendance: 'attendance',
  course_module: 'course module',
  course_module_group: 'course module group',
  course_module_group_order: 'course module group order',
  course_module_order: 'course module order',
  default_included_group: 'default included group',
  feedback: 'feedback',
  group: 'group',
  linked_product: 'linked product',
  membership: 'membership',
  metric: 'metric',
  metric_category: 'metric category',
  metric_category_link: 'metric category link',
  monthly_report: 'monthly report',
  monthly_report_log: 'monthly report log',
  post: 'post',
  post_check: 'post check',
  post_log: 'post log',
  resource: 'resource',
  student_metric_value: 'student metric value',
  tag: 'tag',
};

function normalizeName(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(
  value: UserGroupActivityRawRecord | null | undefined
): UserGroupActivityRawRecord {
  return value ?? {};
}

function isEqualValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function getChangedFields({
  before,
  after,
  explicitFields,
}: {
  before: UserGroupActivityRawRecord;
  after: UserGroupActivityRawRecord;
  explicitFields?: string[] | null;
}) {
  if (explicitFields?.length) {
    return [...explicitFields].sort();
  }

  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((field) => !isEqualValue(before[field], after[field]))
    .sort();
}

function summarizeFieldList(fields: string[]) {
  const visibleFields = fields.filter(
    (field) => !SUMMARY_HIDDEN_FIELDS.has(field)
  );

  if (visibleFields.length === 0) {
    return 'details';
  }

  if (visibleFields.length === 1) {
    return humanizeAuditField(visibleFields[0] ?? 'details');
  }

  if (visibleFields.length === 2) {
    return `${humanizeAuditField(visibleFields[0] ?? 'details')} and ${humanizeAuditField(visibleFields[1] ?? 'details')}`;
  }

  return `${humanizeAuditField(visibleFields[0] ?? 'details')} +${visibleFields.length - 1} more fields`;
}

function buildResourcePhrase({
  resourceLabel,
  resourceType,
}: {
  resourceLabel?: string | null;
  resourceType: UserGroupActivityResourceType;
}) {
  const typeLabel = RESOURCE_LABELS[resourceType] ?? 'resource';
  const label = normalizeName(resourceLabel);

  return label ? `${typeLabel} ${label}` : typeLabel;
}

function buildGroupSuffix(group?: { id: string | null; name: string | null }) {
  const groupName = normalizeName(group?.name);
  return groupName ? ` in ${groupName}` : '';
}

function getRoleLabel(after: UserGroupActivityRawRecord | null | undefined) {
  const value = asRecord(after).role;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function buildUserGroupActivitySummary({
  action,
  affectedUser,
  after,
  changedFields,
  group,
  resourceLabel,
  resourceType,
}: {
  action: UserGroupActivityAction;
  affectedUser?: UserGroupActivityIdentity | null;
  after?: UserGroupActivityRawRecord | null;
  changedFields: string[];
  group?: { id: string | null; name: string | null };
  resourceLabel?: string | null;
  resourceType: UserGroupActivityResourceType;
}) {
  const groupName = normalizeName(group?.name);
  const groupSuffix = buildGroupSuffix(group);
  const affectedUserLabel =
    normalizeName(affectedUser?.name) ||
    normalizeName(affectedUser?.email) ||
    'Unknown user';
  const resourcePhrase = buildResourcePhrase({ resourceLabel, resourceType });

  if (resourceType === 'membership') {
    if (action === 'created') {
      const role = getRoleLabel(after);
      const roleSuffix = role ? ` as ${role}` : '';
      return `Added ${affectedUserLabel}${groupName ? ` to ${groupName}` : ''}${roleSuffix}`;
    }

    if (action === 'deleted' || action === 'removed') {
      return `Removed ${affectedUserLabel}${groupName ? ` from ${groupName}` : ''}`;
    }

    if (action === 'role_updated') {
      return `Updated role for ${affectedUserLabel}${groupSuffix}`;
    }

    return `Updated ${summarizeFieldList(changedFields)} for ${affectedUserLabel}${groupSuffix}`;
  }

  if (resourceType === 'group') {
    const label = groupName || normalizeName(resourceLabel) || 'group';

    switch (action) {
      case 'created':
        return `Created group ${label}`;
      case 'deleted':
      case 'removed':
        return `Deleted group ${label}`;
      case 'archived':
        return `Archived group ${label}`;
      case 'reactivated':
      case 'restored':
        return `Reactivated group ${label}`;
      default:
        return `Updated ${summarizeFieldList(changedFields)} for group ${label}`;
    }
  }

  switch (action) {
    case 'created':
      return `Created ${resourcePhrase}${groupSuffix}`;
    case 'deleted':
    case 'removed':
      return `Deleted ${resourcePhrase}${groupSuffix}`;
    case 'uploaded':
      return `Uploaded ${resourcePhrase}${groupSuffix}`;
    case 'reordered':
      return `Reordered ${resourcePhrase}${groupSuffix}`;
    case 'archived':
      return `Archived ${resourcePhrase}${groupSuffix}`;
    case 'reactivated':
    case 'restored':
      return `Reactivated ${resourcePhrase}${groupSuffix}`;
    default:
      return `Updated ${summarizeFieldList(changedFields)} for ${resourcePhrase}${groupSuffix}`;
  }
}

export function buildUserGroupActivityFieldChanges(row: {
  before: UserGroupActivityRawRecord | null;
  after: UserGroupActivityRawRecord | null;
  changed_fields?: string[] | null;
}) {
  const beforeRecord = asRecord(row.before);
  const afterRecord = asRecord(row.after);
  const changedFields = getChangedFields({
    before: beforeRecord,
    after: afterRecord,
    explicitFields: row.changed_fields,
  });
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};

  const fieldChanges = changedFields.map<UserGroupActivityFieldChange>(
    (field) => {
      const beforeValue = normalizeAuditFieldValue(beforeRecord[field]);
      const afterValue = normalizeAuditFieldValue(afterRecord[field]);
      before[field] = beforeValue;
      after[field] = afterValue;

      return {
        field,
        label: humanizeAuditField(field),
        before: beforeValue,
        after: afterValue,
      };
    }
  );

  return {
    changedFields,
    fieldChanges,
    before,
    after,
  };
}

export function mapUserGroupActivityRowToEvent(
  row: UserGroupActivityRawRow
): UserGroupActivityEvent {
  const affectedUser =
    row.affected_user_id || row.affected_user_name || row.affected_user_email
      ? {
          id: row.affected_user_id,
          name: row.affected_user_name,
          email: row.affected_user_email,
        }
      : null;
  const group = {
    id: row.group_id,
    name: row.group_name,
  };
  const fieldData = buildUserGroupActivityFieldChanges(row);

  return {
    auditRecordId: row.audit_record_id,
    tableName: row.table_name,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceLabel: row.resource_label,
    summary: buildUserGroupActivitySummary({
      action: row.action,
      affectedUser,
      after: row.after,
      changedFields: fieldData.changedFields,
      group,
      resourceLabel: row.resource_label,
      resourceType: row.resource_type,
    }),
    changedFields: fieldData.changedFields,
    fieldChanges: fieldData.fieldChanges,
    before: fieldData.before,
    after: fieldData.after,
    group,
    affectedUser,
    actor: {
      authUid: row.actor_auth_uid,
      workspaceUserId: row.actor_workspace_user_id,
      id: row.actor_id,
      name: row.actor_name,
      email: row.actor_email,
    },
    occurredAt: row.occurred_at,
  };
}

export function mapUserGroupActivityRowsToEvents(
  rows: UserGroupActivityRawRow[]
) {
  return rows.map(mapUserGroupActivityRowToEvent);
}
