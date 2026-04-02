import {
  eachDayOfInterval,
  eachMonthOfInterval,
  format,
  subDays,
} from 'date-fns';

export type WorkspaceUserAuditOperation =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'TRUNCATE'
  | 'SNAPSHOT';

export type WorkspaceUserAuditEventKind =
  | 'created'
  | 'updated'
  | 'archived'
  | 'reactivated'
  | 'archive_until_changed'
  | 'deleted';

export type WorkspaceUserAuditEventKindFilter =
  | 'all'
  | WorkspaceUserAuditEventKind;

export type WorkspaceUserAuditSource = 'live' | 'backfilled';
export type WorkspaceUserAuditSourceFilter = 'all' | WorkspaceUserAuditSource;

export type WorkspaceUserAuditPeriod = 'monthly' | 'yearly';

export type WorkspaceUserAuditRawRecord = Record<string, unknown>;

export interface WorkspaceUserAuditRecordRow {
  audit_record_id: number;
  op: WorkspaceUserAuditOperation;
  ts: string;
  record: WorkspaceUserAuditRawRecord | null;
  old_record: WorkspaceUserAuditRawRecord | null;
  auth_uid: string | null;
  auth_role: string | null;
  ws_id: string;
}

export interface WorkspaceUserAuditIdentity {
  id: string | null;
  name: string | null;
  email: string | null;
}

export interface WorkspaceUserAuditFieldChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface WorkspaceUserAuditEvent {
  auditRecordId: number;
  eventKind: WorkspaceUserAuditEventKind;
  summary: string;
  changedFields: string[];
  fieldChanges: WorkspaceUserAuditFieldChange[];
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  affectedUser: WorkspaceUserAuditIdentity & {
    id: string;
  };
  actor: WorkspaceUserAuditIdentity & {
    authUid: string | null;
    workspaceUserId: string | null;
  };
  occurredAt: string;
  source: WorkspaceUserAuditSource;
}

export interface WorkspaceUserAuditChartStat {
  key: string;
  label: string;
  tooltipLabel: string;
  totalCount: number;
  archivedCount?: number;
  reactivatedCount?: number;
  archiveTimingCount?: number;
  profileUpdateCount?: number;
}

export interface WorkspaceUserAuditSummary {
  totalEvents: number;
  archivedEvents: number;
  reactivatedEvents: number;
  archiveTimingEvents: number;
  archiveRelatedEvents: number;
  profileUpdates: number;
  affectedUsersCount: number;
  topActorName: string | null;
  topActorCount: number;
  peakBucketLabel: string | null;
  peakBucketCount: number;
}

const SUMMARY_HIDDEN_FIELDS = new Set([
  'avatar_url',
  'created_at',
  'deleted_at',
  'updated_at',
]);

function asRecord(
  value: WorkspaceUserAuditRawRecord | null | undefined
): WorkspaceUserAuditRawRecord {
  return value ?? {};
}

function normalizeName(name: string | null | undefined) {
  if (!name) {
    return null;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readString(record: WorkspaceUserAuditRawRecord, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function readBoolean(record: WorkspaceUserAuditRawRecord, key: string) {
  const value = record[key];

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  return null;
}

function isEqualValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function humanizeAuditField(field: string) {
  return field
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeAuditFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeAuditFieldValue(entry) ?? '')
      .join(', ');
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function classifyWorkspaceUserAuditEvent(
  row: Pick<WorkspaceUserAuditRecordRow, 'op' | 'record' | 'old_record'>
): WorkspaceUserAuditEventKind | null {
  if (row.op === 'INSERT') {
    return 'created';
  }

  if (row.op === 'DELETE') {
    return 'deleted';
  }

  if (row.op !== 'UPDATE') {
    return null;
  }

  const record = asRecord(row.record);
  const previousRecord = asRecord(row.old_record);
  const nextArchived = readBoolean(record, 'archived');
  const previousArchived = readBoolean(previousRecord, 'archived');
  const nextArchivedUntil = readString(record, 'archived_until');
  const previousArchivedUntil = readString(previousRecord, 'archived_until');

  if (nextArchived !== previousArchived) {
    return nextArchived ? 'archived' : 'reactivated';
  }

  if (nextArchivedUntil !== previousArchivedUntil) {
    return 'archive_until_changed';
  }

  return 'updated';
}

export function getWorkspaceUserAuditChangedFields(
  row: Pick<WorkspaceUserAuditRecordRow, 'record' | 'old_record'>
) {
  const record = asRecord(row.record);
  const previousRecord = asRecord(row.old_record);
  const keys = new Set([
    ...Object.keys(record),
    ...Object.keys(previousRecord),
  ]);

  return Array.from(keys)
    .filter((key) => !isEqualValue(previousRecord[key], record[key]))
    .sort();
}

export function buildWorkspaceUserAuditFieldChanges(
  row: Pick<WorkspaceUserAuditRecordRow, 'record' | 'old_record'>
) {
  const record = asRecord(row.record);
  const previousRecord = asRecord(row.old_record);
  const changedFields = getWorkspaceUserAuditChangedFields(row);
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};

  const fieldChanges = changedFields.map<WorkspaceUserAuditFieldChange>(
    (field) => {
      const beforeValue = normalizeAuditFieldValue(previousRecord[field]);
      const afterValue = normalizeAuditFieldValue(record[field]);
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

function summarizeFieldList(fields: string[]) {
  const visibleFields = fields.filter(
    (field) => !SUMMARY_HIDDEN_FIELDS.has(field)
  );

  if (visibleFields.length === 0) {
    return 'record details';
  }

  if (visibleFields.length === 1) {
    return humanizeAuditField(visibleFields[0] ?? 'record');
  }

  if (visibleFields.length === 2) {
    return `${humanizeAuditField(visibleFields[0] ?? 'record')} and ${humanizeAuditField(visibleFields[1] ?? 'details')}`;
  }

  return `${humanizeAuditField(visibleFields[0] ?? 'record')} +${visibleFields.length - 1} more fields`;
}

export function buildWorkspaceUserAuditSummary(
  eventKind: WorkspaceUserAuditEventKind,
  affectedUserName: string | null,
  changedFields: string[]
) {
  const label = affectedUserName || 'Unknown user';

  switch (eventKind) {
    case 'created':
      return `Created ${label}`;
    case 'archived':
      return `Archived ${label}`;
    case 'reactivated':
      return `Reactivated ${label}`;
    case 'archive_until_changed':
      return `Updated archive timing for ${label}`;
    case 'deleted':
      return `Deleted ${label}`;
    default:
      return `Updated ${summarizeFieldList(changedFields)} for ${label}`;
  }
}

export function normalizeWorkspaceUserAuditEvent({
  row,
  affectedUser,
  actor,
  source,
}: {
  row: WorkspaceUserAuditRecordRow;
  affectedUser?: WorkspaceUserAuditIdentity | null;
  actor?:
    | (WorkspaceUserAuditIdentity & { workspaceUserId?: string | null })
    | null;
  source?: WorkspaceUserAuditSource;
}): WorkspaceUserAuditEvent | null {
  const eventKind = classifyWorkspaceUserAuditEvent(row);

  if (!eventKind) {
    return null;
  }

  const record = asRecord(row.record);
  const previousRecord = asRecord(row.old_record);
  const affectedUserId =
    normalizeName(readString(record, 'id')) ||
    normalizeName(readString(previousRecord, 'id'));

  if (!affectedUserId) {
    return null;
  }

  const affectedUserName =
    normalizeName(affectedUser?.name) ||
    normalizeName(readString(record, 'full_name')) ||
    normalizeName(readString(record, 'display_name')) ||
    normalizeName(readString(previousRecord, 'full_name')) ||
    normalizeName(readString(previousRecord, 'display_name'));
  const affectedUserEmail =
    affectedUser?.email ||
    readString(record, 'email') ||
    readString(previousRecord, 'email');
  const fieldData = buildWorkspaceUserAuditFieldChanges(row);

  return {
    auditRecordId: row.audit_record_id,
    eventKind,
    summary: buildWorkspaceUserAuditSummary(
      eventKind,
      affectedUserName,
      fieldData.changedFields
    ),
    changedFields: fieldData.changedFields,
    fieldChanges: fieldData.fieldChanges,
    before: fieldData.before,
    after: fieldData.after,
    affectedUser: {
      id: affectedUserId,
      name: affectedUserName,
      email: affectedUserEmail,
    },
    actor: {
      authUid: row.auth_uid,
      workspaceUserId: actor?.workspaceUserId ?? null,
      id: actor?.id ?? row.auth_uid,
      name: actor?.name ?? null,
      email: actor?.email ?? null,
    },
    occurredAt: row.ts,
    source: source ?? 'live',
  };
}

function matchesQuery(value: string | null | undefined, query: string) {
  if (!value) {
    return false;
  }

  return value.toLowerCase().includes(query);
}

export function filterWorkspaceUserAuditEvents(
  events: WorkspaceUserAuditEvent[],
  {
    eventKind,
    source,
    affectedUserQuery,
    actorQuery,
  }: {
    eventKind?: WorkspaceUserAuditEventKindFilter;
    source?: WorkspaceUserAuditSourceFilter;
    affectedUserQuery?: string;
    actorQuery?: string;
  }
) {
  const normalizedAffectedUserQuery = affectedUserQuery?.trim().toLowerCase();
  const normalizedActorQuery = actorQuery?.trim().toLowerCase();

  return events.filter((event) => {
    if (eventKind && eventKind !== 'all' && event.eventKind !== eventKind) {
      return false;
    }

    if (source && source !== 'all' && event.source !== source) {
      return false;
    }

    if (normalizedAffectedUserQuery) {
      const matchesAffectedUser =
        matchesQuery(event.affectedUser.name, normalizedAffectedUserQuery) ||
        matchesQuery(event.affectedUser.email, normalizedAffectedUserQuery) ||
        matchesQuery(event.summary, normalizedAffectedUserQuery);

      if (!matchesAffectedUser) {
        return false;
      }
    }

    if (normalizedActorQuery) {
      const matchesActor =
        matchesQuery(event.actor.name, normalizedActorQuery) ||
        matchesQuery(event.actor.email, normalizedActorQuery) ||
        matchesQuery(event.actor.authUid, normalizedActorQuery);

      if (!matchesActor) {
        return false;
      }
    }

    return true;
  });
}

function buildAuditChartStats({
  locale,
  period,
  start,
  end,
}: {
  locale: string;
  period: WorkspaceUserAuditPeriod;
  start: Date;
  end: Date;
}) {
  if (period === 'yearly') {
    const shortMonthFormatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
    });
    const longMonthFormatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    });

    return eachMonthOfInterval({
      start,
      end: subDays(end, 1),
    }).map<WorkspaceUserAuditChartStat>((date) => ({
      key: format(date, 'yyyy-MM'),
      label: shortMonthFormatter.format(date),
      tooltipLabel: longMonthFormatter.format(date),
      totalCount: 0,
      archivedCount: 0,
      reactivatedCount: 0,
      archiveTimingCount: 0,
      profileUpdateCount: 0,
    }));
  }

  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return eachDayOfInterval({
    start,
    end: subDays(end, 1),
  }).map<WorkspaceUserAuditChartStat>((date) => ({
    key: format(date, 'yyyy-MM-dd'),
    label: format(date, 'd'),
    tooltipLabel: dayFormatter.format(date),
    totalCount: 0,
    archivedCount: 0,
    reactivatedCount: 0,
    archiveTimingCount: 0,
    profileUpdateCount: 0,
  }));
}

export function summarizeWorkspaceUserAuditEvents({
  events,
  locale,
  period,
  start,
  end,
}: {
  events: WorkspaceUserAuditEvent[];
  locale: string;
  period: WorkspaceUserAuditPeriod;
  start: Date;
  end: Date;
}) {
  const chartStats = buildAuditChartStats({
    locale,
    period,
    start,
    end,
  });
  const chartLookup = new Map(
    chartStats.map((stat) => [stat.key, stat] as const)
  );
  const actorCounts = new Map<string, { name: string; count: number }>();
  const affectedUsers = new Set<string>();

  let archivedEvents = 0;
  let reactivatedEvents = 0;
  let archiveTimingEvents = 0;
  let profileUpdates = 0;

  for (const event of events) {
    const bucketKey = format(
      new Date(event.occurredAt),
      period === 'yearly' ? 'yyyy-MM' : 'yyyy-MM-dd'
    );
    const bucket = chartLookup.get(bucketKey);
    if (bucket) {
      bucket.totalCount += 1;
    }

    switch (event.eventKind) {
      case 'archived':
        archivedEvents += 1;
        if (bucket) {
          bucket.archivedCount = (bucket.archivedCount ?? 0) + 1;
        }
        break;
      case 'reactivated':
        reactivatedEvents += 1;
        if (bucket) {
          bucket.reactivatedCount = (bucket.reactivatedCount ?? 0) + 1;
        }
        break;
      case 'archive_until_changed':
        archiveTimingEvents += 1;
        if (bucket) {
          bucket.archiveTimingCount = (bucket.archiveTimingCount ?? 0) + 1;
        }
        break;
      case 'updated':
        profileUpdates += 1;
        if (bucket) {
          bucket.profileUpdateCount = (bucket.profileUpdateCount ?? 0) + 1;
        }
        break;
    }

    affectedUsers.add(event.affectedUser.id);

    const actorKey = event.actor.authUid || 'system';
    actorCounts.set(actorKey, {
      name: event.actor.name || 'Unknown',
      count: (actorCounts.get(actorKey)?.count || 0) + 1,
    });
  }

  const peakBucket =
    chartStats.reduce<WorkspaceUserAuditChartStat | null>((peak, bucket) => {
      if (!peak || bucket.totalCount > peak.totalCount) {
        return bucket;
      }

      return peak;
    }, null) ?? null;
  const topActor =
    Array.from(actorCounts.values()).sort(
      (left, right) => right.count - left.count
    )[0] ?? null;

  const summary: WorkspaceUserAuditSummary = {
    totalEvents: events.length,
    archivedEvents,
    reactivatedEvents,
    archiveTimingEvents,
    archiveRelatedEvents:
      archivedEvents + reactivatedEvents + archiveTimingEvents,
    profileUpdates,
    affectedUsersCount: affectedUsers.size,
    topActorName: topActor?.name || null,
    topActorCount: topActor?.count || 0,
    peakBucketLabel: peakBucket?.tooltipLabel || null,
    peakBucketCount: peakBucket?.totalCount || 0,
  };

  return {
    summary,
    chartStats,
  };
}
