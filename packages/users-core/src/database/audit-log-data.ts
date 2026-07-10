import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  buildWorkspaceUserAuditSummary,
  humanizeAuditField,
  isWorkspaceUserArchiveAuditEvent,
  normalizeAuditFieldValue,
  type WorkspaceUserAuditChartStat,
  type WorkspaceUserAuditEvent,
  type WorkspaceUserAuditEventKind,
  type WorkspaceUserAuditFieldChange,
  type WorkspaceUserAuditIdentity,
  type WorkspaceUserAuditSummary,
} from '@tuturuuu/users-core/lib/workspace-user-audit/normalize';
import { z } from 'zod';
import {
  getAuditLogTimeOptions,
  getAuditLogTimeRange,
  resolveAuditLogPeriod,
} from './audit-log-time';
import type {
  AuditLogEventKindFilter,
  AuditLogPeriod,
  AuditLogSource,
  AuditLogSourceFilter,
  AuditLogTimeOption,
} from './audit-log-types';

const AuditLogEventKindSchema = z.enum([
  'all',
  'created',
  'updated',
  'archived',
  'reactivated',
  'archive_until_changed',
  'deleted',
]);
const AuditLogSourceSchema = z.enum(['all', 'live', 'backfilled']);
const AuditLogPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

type AuditFeedRow = {
  audit_record_id: number;
  event_kind: WorkspaceUserAuditEventKind;
  occurred_at: string;
  source: AuditLogSource;
  affected_user_id: string;
  affected_user_name: string | null;
  affected_user_email: string | null;
  actor_auth_uid: string | null;
  actor_workspace_user_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  changed_fields: string[] | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  total_count?: number | null;
};

type AuditSummaryRow = {
  total_events: number | null;
  archived_events: number | null;
  reactivated_events: number | null;
  archive_timing_events: number | null;
  archive_related_events: number | null;
  profile_updates: number | null;
  affected_users_count: number | null;
  top_actor_name: string | null;
  top_actor_count: number | null;
};

type AuditBucketRow = {
  bucket_key: string;
  total_count: number | null;
  archived_count: number | null;
  reactivated_count: number | null;
  archive_timing_count: number | null;
  profile_update_count: number | null;
};

type AuditViewPayload = {
  count: number | null;
  rows: AuditFeedRow[] | null;
  summary: AuditSummaryRow | null;
  buckets: AuditBucketRow[] | null;
};

export type LegacyStatusChangeRow = {
  user_id: string;
  archived: boolean;
  archived_until: string | null;
  creator_id: string | null;
  actor_auth_uid: string | null;
  source: AuditLogSource;
  audit_record_version_id: number | null;
  created_at: string;
};

function resolveEventKindFilter(value?: string): AuditLogEventKindFilter {
  return AuditLogEventKindSchema.catch('all').parse(value);
}

function resolveSourceFilter(value?: string): AuditLogSourceFilter {
  return AuditLogSourceSchema.catch('all').parse(value);
}

function toCount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeArchivalNote(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function omitRecordKeys(
  record: Record<string, string | null>,
  keys: ReadonlySet<string>
) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.has(key))
  );
}

const PRIVATE_AUDIT_FIELDS = new Set(['note']);

function stripPrivateAuditFields(event: WorkspaceUserAuditEvent) {
  return {
    ...event,
    archivalNote: null,
    changedFields: event.changedFields.filter(
      (field) => !PRIVATE_AUDIT_FIELDS.has(field)
    ),
    fieldChanges: event.fieldChanges.filter(
      (fieldChange) => !PRIVATE_AUDIT_FIELDS.has(fieldChange.field)
    ),
    before: omitRecordKeys(event.before, PRIVATE_AUDIT_FIELDS),
    after: omitRecordKeys(event.after, PRIVATE_AUDIT_FIELDS),
  };
}

function buildFieldChangesFromSnapshots(
  changedFields: string[],
  beforeRecord: Record<string, unknown>,
  afterRecord: Record<string, unknown>
) {
  return changedFields.map<WorkspaceUserAuditFieldChange>((field) => ({
    field,
    label: humanizeAuditField(field),
    before: normalizeAuditFieldValue(beforeRecord[field]),
    after: normalizeAuditFieldValue(afterRecord[field]),
  }));
}

function mapFeedRowToEvent(row: AuditFeedRow): WorkspaceUserAuditEvent {
  const changedFields = row.changed_fields ?? [];
  const beforeRecord = asRecord(row.before);
  const afterRecord = asRecord(row.after);
  const archivalNote = isWorkspaceUserArchiveAuditEvent(row.event_kind)
    ? normalizeArchivalNote(afterRecord.note)
    : null;

  return {
    auditRecordId: row.audit_record_id,
    eventKind: row.event_kind,
    summary: buildWorkspaceUserAuditSummary(
      row.event_kind,
      row.affected_user_name ?? row.affected_user_email,
      changedFields
    ),
    changedFields,
    fieldChanges: buildFieldChangesFromSnapshots(
      changedFields,
      beforeRecord,
      afterRecord
    ),
    before: Object.fromEntries(
      Object.entries(beforeRecord).map(([key, value]) => [
        key,
        normalizeAuditFieldValue(value),
      ])
    ),
    after: Object.fromEntries(
      Object.entries(afterRecord).map(([key, value]) => [
        key,
        normalizeAuditFieldValue(value),
      ])
    ),
    affectedUser: {
      id: row.affected_user_id,
      name: row.affected_user_name,
      email: row.affected_user_email,
    },
    actor: {
      authUid: row.actor_auth_uid,
      workspaceUserId: row.actor_workspace_user_id,
      id: row.actor_id,
      name: row.actor_name,
      email: row.actor_email,
    },
    occurredAt: row.occurred_at,
    source: row.source,
    archivalNote,
  };
}

async function attachArchivalNotes(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    events,
    canViewPrivateInfo,
  }: {
    wsId: string;
    events: WorkspaceUserAuditEvent[];
    canViewPrivateInfo?: boolean;
  }
) {
  if (!canViewPrivateInfo) {
    return events.map(stripPrivateAuditFields);
  }

  const missingNoteUserIds = [
    ...new Set(
      events
        .filter(
          (event) =>
            isWorkspaceUserArchiveAuditEvent(event.eventKind) &&
            !normalizeArchivalNote(event.archivalNote)
        )
        .map((event) => event.affectedUser.id)
    ),
  ];

  if (missingNoteUserIds.length === 0) {
    return events;
  }

  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('id, note')
    .eq('ws_id', wsId)
    .in('id', missingNoteUserIds);

  if (error) {
    throw error;
  }

  const noteByUserId = new Map(
    ((data ?? []) as Array<{ id: string; note: string | null }>).map((row) => [
      row.id,
      normalizeArchivalNote(row.note),
    ])
  );

  return events.map((event) => {
    if (!isWorkspaceUserArchiveAuditEvent(event.eventKind)) {
      return {
        ...event,
        archivalNote: null,
      };
    }

    return {
      ...event,
      archivalNote:
        normalizeArchivalNote(event.archivalNote) ??
        noteByUserId.get(event.affectedUser.id) ??
        null,
    };
  });
}

function buildChartStatsFromBuckets({
  locale,
  period,
  start,
  end,
  bucketRows,
}: {
  locale: string;
  period: AuditLogPeriod;
  start: Date;
  end: Date;
  bucketRows: AuditBucketRow[];
}) {
  const bucketLookup = new Map(
    bucketRows.map((row) => [
      row.bucket_key,
      {
        totalCount: toCount(row.total_count),
        archivedCount: toCount(row.archived_count),
        reactivatedCount: toCount(row.reactivated_count),
        archiveTimingCount: toCount(row.archive_timing_count),
        profileUpdateCount: toCount(row.profile_update_count),
      },
    ])
  );

  if (period === 'yearly') {
    const formatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    });

    const stats: WorkspaceUserAuditChartStat[] = [];
    const current = new Date(start);

    while (current < end) {
      const key = `${current.getFullYear()}-${`${current.getMonth() + 1}`.padStart(2, '0')}`;
      const counts = bucketLookup.get(key);

      stats.push({
        key,
        label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(
          current
        ),
        tooltipLabel: formatter.format(current),
        totalCount: counts?.totalCount ?? 0,
        archivedCount: counts?.archivedCount ?? 0,
        reactivatedCount: counts?.reactivatedCount ?? 0,
        archiveTimingCount: counts?.archiveTimingCount ?? 0,
        profileUpdateCount: counts?.profileUpdateCount ?? 0,
      });

      current.setMonth(current.getMonth() + 1);
    }

    return stats;
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const stats = [];
  const current = new Date(start);

  while (current < end) {
    const yearValue = current.getFullYear();
    const monthValue = `${current.getMonth() + 1}`.padStart(2, '0');
    const dayValue = `${current.getDate()}`.padStart(2, '0');
    const key = `${yearValue}-${monthValue}-${dayValue}`;
    const counts = bucketLookup.get(key);

    stats.push({
      key,
      label: `${current.getDate()}`,
      tooltipLabel: formatter.format(current),
      totalCount: counts?.totalCount ?? 0,
      archivedCount: counts?.archivedCount ?? 0,
      reactivatedCount: counts?.reactivatedCount ?? 0,
      archiveTimingCount: counts?.archiveTimingCount ?? 0,
      profileUpdateCount: counts?.profileUpdateCount ?? 0,
    });

    current.setDate(current.getDate() + 1);
  }

  return stats;
}

async function fetchAuditFeedPage(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    start,
    end,
    eventKind,
    source,
    affectedUserQuery,
    actorQuery,
    limit,
    offset,
    canViewPrivateInfo,
  }: {
    wsId: string;
    start: Date;
    end: Date;
    eventKind: AuditLogEventKindFilter;
    source: AuditLogSourceFilter;
    affectedUserQuery?: string;
    actorQuery?: string;
    limit: number;
    offset: number;
    canViewPrivateInfo?: boolean;
  }
) {
  const { data, error } = await sbAdmin.rpc('list_workspace_user_audit_feed', {
    p_ws_id: wsId,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_event_kind: eventKind,
    p_source: source,
    p_affected_user_query: affectedUserQuery?.trim() || undefined,
    p_actor_query: actorQuery?.trim() || undefined,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as AuditFeedRow[];
  const events = rows.map(mapFeedRowToEvent);

  return {
    count: toCount(rows[0]?.total_count),
    data: await attachArchivalNotes(sbAdmin, {
      wsId,
      events,
      canViewPrivateInfo,
    }),
  };
}

async function fetchAuditView(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    start,
    end,
    period,
    eventKind,
    source,
    affectedUserQuery,
    actorQuery,
    limit,
    offset,
    canViewPrivateInfo,
  }: {
    wsId: string;
    start: Date;
    end: Date;
    period: AuditLogPeriod;
    eventKind: AuditLogEventKindFilter;
    source: AuditLogSourceFilter;
    affectedUserQuery?: string;
    actorQuery?: string;
    limit: number;
    offset: number;
    canViewPrivateInfo?: boolean;
  }
) {
  const { data, error } = await sbAdmin.rpc('get_workspace_user_audit_view', {
    p_ws_id: wsId,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_period: period,
    p_event_kind: eventKind,
    p_source: source,
    p_affected_user_query: affectedUserQuery?.trim() || undefined,
    p_actor_query: actorQuery?.trim() || undefined,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw error;
  }

  const payload = asRecord(data) as AuditViewPayload;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const bucketRows = Array.isArray(payload.buckets) ? payload.buckets : [];
  const summaryRow = payload.summary ?? null;
  const events = rows.map(mapFeedRowToEvent);

  return {
    count: toCount(payload.count),
    data: await attachArchivalNotes(sbAdmin, {
      wsId,
      events,
      canViewPrivateInfo,
    }),
    summary: {
      totalEvents: toCount(summaryRow?.total_events),
      archivedEvents: toCount(summaryRow?.archived_events),
      reactivatedEvents: toCount(summaryRow?.reactivated_events),
      archiveTimingEvents: toCount(summaryRow?.archive_timing_events),
      archiveRelatedEvents: toCount(summaryRow?.archive_related_events),
      profileUpdates: toCount(summaryRow?.profile_updates),
      affectedUsersCount: toCount(summaryRow?.affected_users_count),
      topActorName: summaryRow?.top_actor_name ?? null,
      topActorCount: toCount(summaryRow?.top_actor_count),
    } satisfies Omit<
      WorkspaceUserAuditSummary,
      'peakBucketLabel' | 'peakBucketCount'
    >,
    bucketRows,
  };
}

function createSyntheticAuditRecordId(seed: string, index: number) {
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return -Math.abs(hash || index + 1);
}

function buildLegacyStatusFieldChanges({
  eventKind,
  current,
  previous,
}: {
  eventKind: WorkspaceUserAuditEventKind;
  current: LegacyStatusChangeRow;
  previous?: LegacyStatusChangeRow;
}) {
  const changedFields =
    eventKind === 'archive_until_changed'
      ? ['archived_until']
      : current.archived_until !== previous?.archived_until &&
          current.archived_until
        ? ['archived', 'archived_until']
        : ['archived'];

  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};

  const fieldChanges = changedFields.map<WorkspaceUserAuditFieldChange>(
    (field) => {
      const beforeValue =
        field === 'archived'
          ? normalizeAuditFieldValue(previous?.archived ?? !current.archived)
          : normalizeAuditFieldValue(previous?.archived_until ?? null);
      const afterValue =
        field === 'archived'
          ? normalizeAuditFieldValue(current.archived)
          : normalizeAuditFieldValue(current.archived_until);

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

export function buildLegacyStatusEvents({
  rows,
  affectedUsers,
  authActors,
  workspaceUsers,
}: {
  rows: LegacyStatusChangeRow[];
  affectedUsers: Map<string, WorkspaceUserAuditIdentity>;
  authActors: Map<
    string,
    WorkspaceUserAuditIdentity & { workspaceUserId: string | null }
  >;
  workspaceUsers: Map<string, WorkspaceUserAuditIdentity>;
}) {
  const previousByUser = new Map<string, LegacyStatusChangeRow>();

  return rows.map<WorkspaceUserAuditEvent>((row, index) => {
    const previous = previousByUser.get(row.user_id);
    let eventKind: WorkspaceUserAuditEventKind;

    if (!row.archived) {
      eventKind = 'reactivated';
    } else if (
      previous?.archived === true &&
      previous.archived_until !== row.archived_until
    ) {
      eventKind = 'archive_until_changed';
    } else {
      eventKind = 'archived';
    }

    previousByUser.set(row.user_id, row);

    const affectedUser = affectedUsers.get(row.user_id) ?? {
      id: row.user_id,
      name: null,
      email: null,
    };
    const actorFromAuth = row.actor_auth_uid
      ? authActors.get(row.actor_auth_uid)
      : null;
    const actorFromWorkspaceUser = row.creator_id
      ? workspaceUsers.get(row.creator_id)
      : null;
    const actor = actorFromAuth
      ? {
          authUid: row.actor_auth_uid,
          workspaceUserId: actorFromAuth.workspaceUserId,
          id: actorFromAuth.id,
          name: actorFromAuth.name,
          email: actorFromAuth.email,
        }
      : {
          authUid: row.actor_auth_uid,
          workspaceUserId: row.creator_id,
          id: row.creator_id,
          name: actorFromWorkspaceUser?.name ?? null,
          email: actorFromWorkspaceUser?.email ?? null,
        };
    const fieldData = buildLegacyStatusFieldChanges({
      eventKind,
      current: row,
      previous,
    });

    return {
      auditRecordId:
        row.audit_record_version_id ??
        createSyntheticAuditRecordId(
          `${row.user_id}:${row.created_at}:${row.archived}:${row.archived_until ?? ''}`,
          index
        ),
      eventKind,
      summary: buildWorkspaceUserAuditSummary(
        eventKind,
        affectedUser.name ?? affectedUser.email,
        fieldData.changedFields
      ),
      changedFields: fieldData.changedFields,
      fieldChanges: fieldData.fieldChanges,
      before: fieldData.before,
      after: fieldData.after,
      affectedUser: {
        id: row.user_id,
        name: affectedUser.name,
        email: affectedUser.email,
      },
      actor,
      occurredAt: row.created_at,
      source: row.source ?? 'live',
    };
  });
}

export function getRecentAuditLogTimeOptions(
  locale: string,
  period: AuditLogPeriod
): AuditLogTimeOption[] {
  return getAuditLogTimeOptions({
    locale,
    period,
    count: period === 'yearly' ? 6 : 12,
  });
}

export async function getAuditLogView({
  wsId,
  locale,
  period,
  month,
  year,
  eventKind,
  source,
  affectedUserQuery,
  actorQuery,
  page,
  pageSize,
  canViewPrivateInfo = false,
}: {
  wsId: string;
  locale: string;
  period?: string;
  month?: string;
  year?: string;
  eventKind?: string;
  source?: string;
  affectedUserQuery?: string;
  actorQuery?: string;
  page?: number;
  pageSize?: number;
  canViewPrivateInfo?: boolean;
}) {
  const resolvedPeriod = resolveAuditLogPeriod(period);
  const resolvedEventKind = resolveEventKindFilter(eventKind);
  const resolvedSource = resolveSourceFilter(source);
  const {
    value: selectedValue,
    start,
    end,
  } = getAuditLogTimeRange({
    period: resolvedPeriod,
    month,
    year,
  });
  const { page: validatedPage, pageSize: validatedPageSize } =
    AuditLogPaginationSchema.parse({
      page,
      pageSize,
    });

  try {
    const sbAdmin = await createAdminClient();
    const offset = (validatedPage - 1) * validatedPageSize;
    const view = await fetchAuditView(sbAdmin, {
      wsId,
      start,
      end,
      period: resolvedPeriod,
      eventKind: resolvedEventKind,
      source: resolvedSource,
      affectedUserQuery,
      actorQuery,
      limit: validatedPageSize,
      offset,
      canViewPrivateInfo,
    });
    const chartStats = buildChartStatsFromBuckets({
      locale,
      period: resolvedPeriod,
      start,
      end,
      bucketRows: view.bucketRows,
    });
    const peakBucket =
      chartStats.reduce<WorkspaceUserAuditChartStat | null>((peak, bucket) => {
        if (!peak || bucket.totalCount > peak.totalCount) {
          return bucket;
        }

        return peak;
      }, null) ?? null;
    const summary: WorkspaceUserAuditSummary = {
      ...view.summary,
      peakBucketLabel: peakBucket?.tooltipLabel ?? null,
      peakBucketCount: peakBucket?.totalCount ?? 0,
    };

    return {
      period: resolvedPeriod,
      selectedValue,
      eventKind: resolvedEventKind,
      source: resolvedSource,
      affectedUserQuery: affectedUserQuery?.trim() ?? '',
      actorQuery: actorQuery?.trim() ?? '',
      page: validatedPage,
      pageSize: validatedPageSize,
      count: view.count,
      data: view.data,
      allFilteredEvents: [] as WorkspaceUserAuditEvent[],
      summary,
      chartStats,
    };
  } catch (error) {
    console.error('Error fetching workspace user audit view:', error);

    return {
      period: resolvedPeriod,
      selectedValue,
      eventKind: resolvedEventKind,
      source: resolvedSource,
      affectedUserQuery: affectedUserQuery?.trim() ?? '',
      actorQuery: actorQuery?.trim() ?? '',
      page: validatedPage,
      pageSize: validatedPageSize,
      count: 0,
      data: [] as WorkspaceUserAuditEvent[],
      allFilteredEvents: [] as WorkspaceUserAuditEvent[],
      summary: {
        totalEvents: 0,
        archivedEvents: 0,
        reactivatedEvents: 0,
        archiveTimingEvents: 0,
        archiveRelatedEvents: 0,
        profileUpdates: 0,
        affectedUsersCount: 0,
        topActorName: null,
        topActorCount: 0,
        peakBucketLabel: null,
        peakBucketCount: 0,
      },
      chartStats: [],
    };
  }
}

export async function listAuditLogEventsForRange({
  wsId,
  start,
  end,
  eventKind,
  source,
  affectedUserQuery,
  actorQuery,
  offset = 0,
  limit = 500,
  canViewPrivateInfo = false,
}: {
  wsId: string;
  start: string;
  end: string;
  eventKind?: string;
  source?: string;
  affectedUserQuery?: string;
  actorQuery?: string;
  offset?: number;
  limit?: number;
  canViewPrivateInfo?: boolean;
}) {
  const sbAdmin = await createAdminClient();
  const resolvedEventKind = resolveEventKindFilter(eventKind);
  const resolvedSource = resolveSourceFilter(source);
  const response = await fetchAuditFeedPage(sbAdmin, {
    wsId,
    start: new Date(start),
    end: new Date(end),
    eventKind: resolvedEventKind,
    source: resolvedSource,
    affectedUserQuery,
    actorQuery,
    limit,
    offset,
    canViewPrivateInfo,
  });

  return {
    count: response.count,
    data: response.data,
  };
}
