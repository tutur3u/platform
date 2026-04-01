import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import {
  buildWorkspaceUserAuditSummary,
  filterWorkspaceUserAuditEvents,
  humanizeAuditField,
  normalizeAuditFieldValue,
  normalizeWorkspaceUserAuditEvent,
  summarizeWorkspaceUserAuditEvents,
  type WorkspaceUserAuditEvent,
  type WorkspaceUserAuditEventKind,
  type WorkspaceUserAuditFieldChange,
  type WorkspaceUserAuditIdentity,
  type WorkspaceUserAuditRawRecord,
  type WorkspaceUserAuditRecordRow,
} from '@/lib/workspace-user-audit/normalize';
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

type PlatformUserRow = {
  id: string;
  display_name: string | null;
  user_private_details?:
    | {
        full_name: string | null;
        email: string | null;
      }
    | {
        full_name: string | null;
        email: string | null;
      }[]
    | null;
};

type WorkspaceUserRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
};

type WorkspaceUserLinkRow = {
  platform_user_id: string;
  virtual_user_id: string;
  workspace_user: WorkspaceUserRow | WorkspaceUserRow[] | null;
};

type StatusSourceRow = {
  audit_record_version_id: number | null;
  source: AuditLogSource;
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

function normalizeName(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function extractUserPrivateDetails(
  value: PlatformUserRow['user_private_details']
): { full_name: string | null; email: string | null } | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function batchValues<T>(values: T[], batchSize = 500) {
  const nextBatches: T[][] = [];

  for (let index = 0; index < values.length; index += batchSize) {
    nextBatches.push(values.slice(index, index + batchSize));
  }

  return nextBatches;
}

function asAuditRawRecord(value: unknown): WorkspaceUserAuditRawRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as WorkspaceUserAuditRawRecord;
}

async function fetchAuditRows(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    start,
    end,
  }: {
    wsId: string;
    start: Date;
    end: Date;
  }
) {
  const { data, error } = await sbAdmin.rpc(
    'list_workspace_user_audit_records',
    {
      p_ws_id: wsId,
      p_start: start.toISOString(),
      p_end: end.toISOString(),
    }
  );

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    audit_record_id: row.audit_record_id,
    op: row.op,
    ts: row.ts,
    record: asAuditRawRecord(row.record),
    old_record: asAuditRawRecord(row.old_record),
    auth_uid: row.auth_uid ?? null,
    auth_role: row.auth_role ?? null,
    ws_id: row.ws_id,
  }));
}

async function fetchStatusSources(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  auditRecordIds: number[]
) {
  const sourceLookup = new Map<number, AuditLogSource>();

  for (const batch of batchValues(auditRecordIds)) {
    const { data, error } = await sbAdmin
      .from('workspace_user_status_changes')
      .select('audit_record_version_id, source')
      .eq('ws_id', wsId)
      .in('audit_record_version_id', batch);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as StatusSourceRow[]) {
      if (typeof row.audit_record_version_id === 'number') {
        sourceLookup.set(row.audit_record_version_id, row.source ?? 'live');
      }
    }
  }

  return sourceLookup;
}

async function fetchLegacyStatusRows(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  start: Date,
  end: Date
) {
  const { data, error } = await sbAdmin
    .from('workspace_user_status_changes')
    .select(
      'user_id, archived, archived_until, creator_id, actor_auth_uid, source, audit_record_version_id, created_at'
    )
    .eq('ws_id', wsId)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as LegacyStatusChangeRow[];
}

async function fetchAffectedUsers(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  affectedUserIds: string[]
) {
  const affectedUserLookup = new Map<string, WorkspaceUserAuditIdentity>();

  for (const batch of batchValues(affectedUserIds)) {
    const { data, error } = await sbAdmin
      .from('workspace_users')
      .select('id, full_name, display_name, email')
      .eq('ws_id', wsId)
      .in('id', batch);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as WorkspaceUserRow[]) {
      affectedUserLookup.set(row.id, {
        id: row.id,
        name: normalizeName(row.full_name, row.display_name),
        email: row.email ?? null,
      });
    }
  }

  return affectedUserLookup;
}

async function fetchActorIdentities(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  authUserIds: string[]
) {
  const actorLookup = new Map<
    string,
    WorkspaceUserAuditIdentity & { workspaceUserId: string | null }
  >();

  if (authUserIds.length === 0) {
    return actorLookup;
  }

  for (const batch of batchValues(authUserIds)) {
    const [
      { data: linkedUsers, error: linkedUsersError },
      { data: users, error: usersError },
    ] = await Promise.all([
      sbAdmin
        .from('workspace_user_linked_users')
        .select(
          'platform_user_id, virtual_user_id, workspace_user:workspace_users!virtual_user_id(id, full_name, display_name, email)'
        )
        .eq('ws_id', wsId)
        .in('platform_user_id', batch),
      sbAdmin
        .from('users')
        .select('id, display_name, user_private_details(full_name, email)')
        .in('id', batch),
    ]);

    if (linkedUsersError) {
      throw linkedUsersError;
    }

    if (usersError) {
      throw usersError;
    }

    const platformUserLookup = new Map<string, WorkspaceUserAuditIdentity>();

    for (const row of (users ?? []) as PlatformUserRow[]) {
      const privateDetails = extractUserPrivateDetails(
        row.user_private_details
      );
      platformUserLookup.set(row.id, {
        id: row.id,
        name: normalizeName(privateDetails?.full_name, row.display_name),
        email: privateDetails?.email ?? null,
      });
    }

    for (const row of (linkedUsers ?? []) as WorkspaceUserLinkRow[]) {
      const workspaceUser = Array.isArray(row.workspace_user)
        ? (row.workspace_user[0] ?? null)
        : row.workspace_user;
      const platformUser = platformUserLookup.get(row.platform_user_id);

      actorLookup.set(row.platform_user_id, {
        id: row.platform_user_id,
        workspaceUserId: row.virtual_user_id,
        name: normalizeName(
          workspaceUser?.full_name,
          workspaceUser?.display_name,
          platformUser?.name
        ),
        email: workspaceUser?.email ?? platformUser?.email ?? null,
      });
    }

    for (const authUserId of batch) {
      if (!actorLookup.has(authUserId)) {
        const platformUser = platformUserLookup.get(authUserId);
        actorLookup.set(authUserId, {
          id: authUserId,
          workspaceUserId: null,
          name: platformUser?.name ?? null,
          email: platformUser?.email ?? null,
        });
      }
    }
  }

  return actorLookup;
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

async function loadWorkspaceUserAuditEvents({
  wsId,
  start,
  end,
}: {
  wsId: string;
  start: Date;
  end: Date;
}) {
  const sbAdmin = await createAdminClient();
  const auditRows = await fetchAuditRows(sbAdmin, {
    wsId,
    start,
    end,
  });
  const legacyStatusRows = await fetchLegacyStatusRows(
    sbAdmin,
    wsId,
    start,
    end
  );
  const auditRecordIds = auditRows.map((row) => row.audit_record_id);
  const auditRecordIdSet = new Set(auditRecordIds);
  const unmatchedLegacyStatusRows = legacyStatusRows.filter(
    (row) =>
      typeof row.audit_record_version_id !== 'number' ||
      !auditRecordIdSet.has(row.audit_record_version_id)
  );
  const getAffectedUserId = (row: WorkspaceUserAuditRecordRow) =>
    typeof row.record?.id === 'string'
      ? row.record.id
      : typeof row.old_record?.id === 'string'
        ? row.old_record.id
        : null;
  const workspaceUserIds = Array.from(
    new Set(
      [
        ...auditRows.map((row) => getAffectedUserId(row)),
        ...unmatchedLegacyStatusRows.map((row) => row.user_id),
        ...unmatchedLegacyStatusRows.map((row) => row.creator_id),
      ].filter((value): value is string => Boolean(value))
    )
  );
  const affectedUserIds = Array.from(
    new Set(
      auditRows
        .map((row) => getAffectedUserId(row))
        .filter((value): value is string => Boolean(value))
    )
  );
  const actorUserIds = Array.from(
    new Set(
      [
        ...auditRows.map((row) => row.auth_uid),
        ...unmatchedLegacyStatusRows.map((row) => row.actor_auth_uid),
      ].filter((value): value is string => Boolean(value))
    )
  );

  const [statusSources, affectedUsers, actors, workspaceUsers] =
    await Promise.all([
      fetchStatusSources(sbAdmin, wsId, auditRecordIds),
      fetchAffectedUsers(sbAdmin, wsId, affectedUserIds),
      fetchActorIdentities(sbAdmin, wsId, actorUserIds),
      fetchAffectedUsers(sbAdmin, wsId, workspaceUserIds),
    ]);

  const normalizedAuditEvents = auditRows
    .map((row) =>
      normalizeWorkspaceUserAuditEvent({
        row,
        affectedUser: affectedUsers.get(getAffectedUserId(row) ?? '') ?? null,
        actor: (row.auth_uid ? actors.get(row.auth_uid) : null) ?? null,
        source: statusSources.get(row.audit_record_id) ?? 'live',
      })
    )
    .filter((event): event is WorkspaceUserAuditEvent => Boolean(event));
  const legacyStatusEvents = buildLegacyStatusEvents({
    rows: unmatchedLegacyStatusRows,
    affectedUsers: workspaceUsers,
    authActors: actors,
    workspaceUsers,
  });

  return [...normalizedAuditEvents, ...legacyStatusEvents].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  );
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
    const allEvents = await loadWorkspaceUserAuditEvents({
      wsId,
      start,
      end,
    });
    const filteredEvents = filterWorkspaceUserAuditEvents(allEvents, {
      eventKind: resolvedEventKind,
      source: resolvedSource,
      affectedUserQuery,
      actorQuery,
    });
    const startIndex = (validatedPage - 1) * validatedPageSize;
    const pageEvents = filteredEvents.slice(
      startIndex,
      startIndex + validatedPageSize
    );
    const { summary, chartStats } = summarizeWorkspaceUserAuditEvents({
      events: filteredEvents,
      locale,
      period: resolvedPeriod,
      start,
      end,
    });

    return {
      period: resolvedPeriod,
      selectedValue,
      eventKind: resolvedEventKind,
      source: resolvedSource,
      affectedUserQuery: affectedUserQuery?.trim() ?? '',
      actorQuery: actorQuery?.trim() ?? '',
      page: validatedPage,
      pageSize: validatedPageSize,
      count: filteredEvents.length,
      data: pageEvents,
      allFilteredEvents: filteredEvents,
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
}) {
  const resolvedEventKind = resolveEventKindFilter(eventKind);
  const resolvedSource = resolveSourceFilter(source);
  const allEvents = await loadWorkspaceUserAuditEvents({
    wsId,
    start: new Date(start),
    end: new Date(end),
  });
  const filteredEvents = filterWorkspaceUserAuditEvents(allEvents, {
    eventKind: resolvedEventKind,
    source: resolvedSource,
    affectedUserQuery,
    actorQuery,
  });

  return {
    count: filteredEvents.length,
    data: filteredEvents.slice(offset, offset + limit),
  };
}
