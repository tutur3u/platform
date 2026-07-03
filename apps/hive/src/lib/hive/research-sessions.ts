import type { Json } from '@tuturuuu/types/db';
import { asHiveJson, getHiveSql } from './hive-db';
import { ensureHiveResearchSchema } from './research-schema';
import { listHiveResearchTimeline } from './research-timeline';
import type {
  HiveResearchSessionEventRow,
  HiveResearchSessionRow,
} from './types';

export { listHiveResearchTimeline } from './research-timeline';

function asJson(value: unknown): Json {
  return value === undefined ? null : (value as Json);
}

export function mapHiveResearchSession(row: HiveResearchSessionRow) {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    description: row.description,
    endedAt: row.ended_at,
    id: row.id,
    metadata: asJson(row.metadata),
    name: row.name,
    serverId: row.server_id,
    startedAt: row.started_at,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function mapHiveResearchSessionEvent(row: HiveResearchSessionEventRow) {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    eventKind: row.event_kind,
    id: row.id,
    payload: asJson(row.payload),
    serverId: row.server_id,
    sessionId: row.session_id,
    sourceId: row.source_id,
    sourceType: row.source_type,
  };
}

export async function listHiveResearchSessions(input: { serverId: string }) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();
  const sessions = await sql<HiveResearchSessionRow[]>`
    select id, server_id, name, description, status, created_by, started_at,
      ended_at, metadata, created_at, updated_at
    from hive_research_sessions
    where server_id = ${input.serverId}
      and status <> 'archived'
    order by
      case when status = 'running' then 0 else 1 end,
      started_at desc
  `;

  return sessions.map(mapHiveResearchSession);
}

export async function getHiveResearchSession(input: {
  serverId: string;
  sessionId: string;
}) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();
  const [session] = await sql<HiveResearchSessionRow[]>`
    select id, server_id, name, description, status, created_by, started_at,
      ended_at, metadata, created_at, updated_at
    from hive_research_sessions
    where id = ${input.sessionId}
      and server_id = ${input.serverId}
    limit 1
  `;

  return session ? mapHiveResearchSession(session) : null;
}

export async function createHiveResearchSession(input: {
  actorUserId: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  name: string;
  serverId: string;
  status?: 'paused' | 'running';
}) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();
  const status = input.status ?? 'running';

  return sql.begin(async (tx) => {
    if (status === 'running') {
      await tx`
        update hive_research_sessions
        set status = 'completed',
          ended_at = coalesce(ended_at, now()),
          updated_at = now()
        where server_id = ${input.serverId}
          and status = 'running'
      `;
    }

    const [session] = await tx<HiveResearchSessionRow[]>`
      insert into hive_research_sessions (
        server_id, name, description, status, created_by, metadata
      )
      values (
        ${input.serverId},
        ${input.name},
        ${input.description ?? null},
        ${status},
        ${input.actorUserId},
        ${tx.json(asHiveJson(input.metadata ?? {}))}
      )
      returning id, server_id, name, description, status, created_by,
        started_at, ended_at, metadata, created_at, updated_at
    `;

    if (!session) return null;

    await tx`
      insert into hive_research_session_events (
        session_id, server_id, actor_user_id, event_kind, source_type, source_id,
        payload
      )
      values (
        ${session.id},
        ${input.serverId},
        ${input.actorUserId},
        'session.created',
        'research_session',
        ${session.id},
        ${tx.json(asHiveJson({ status }))}
      )
    `;

    return mapHiveResearchSession(session);
  });
}

export async function updateHiveResearchSession(input: {
  actorUserId: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  name?: string;
  serverId: string;
  sessionId: string;
  status?: 'archived' | 'completed' | 'paused' | 'running';
}) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();

  return sql.begin(async (tx) => {
    if (input.status === 'running') {
      await tx`
        update hive_research_sessions
        set status = 'completed',
          ended_at = coalesce(ended_at, now()),
          updated_at = now()
        where server_id = ${input.serverId}
          and status = 'running'
          and id <> ${input.sessionId}
      `;
    }

    const [session] = await tx<HiveResearchSessionRow[]>`
      update hive_research_sessions
      set name = case when ${input.name !== undefined}
          then ${input.name ?? ''} else name end,
        description = case when ${input.description !== undefined}
          then ${input.description ?? null} else description end,
        status = case when ${input.status !== undefined}
          then ${input.status ?? 'running'} else status end,
        ended_at = case
          when ${input.status === 'completed' || input.status === 'archived'}
          then coalesce(ended_at, now())
          when ${input.status === 'running'}
          then null
          else ended_at
        end,
        metadata = case when ${input.metadata !== undefined}
          then metadata || ${tx.json(asHiveJson(input.metadata ?? {}))}::jsonb
          else metadata end,
        updated_at = now()
      where id = ${input.sessionId}
        and server_id = ${input.serverId}
      returning id, server_id, name, description, status, created_by,
        started_at, ended_at, metadata, created_at, updated_at
    `;

    if (!session) return null;

    await tx`
      insert into hive_research_session_events (
        session_id, server_id, actor_user_id, event_kind, source_type, source_id,
        payload
      )
      values (
        ${session.id},
        ${input.serverId},
        ${input.actorUserId},
        'session.updated',
        'research_session',
        ${session.id},
        ${tx.json(
          asHiveJson({
            name: input.name,
            status: input.status,
          })
        )}
      )
    `;

    return mapHiveResearchSession(session);
  });
}

export async function getHiveResearchSessionExport(input: {
  isAdmin?: boolean;
  serverId: string;
  sessionId: string;
}) {
  const [session, timeline] = await Promise.all([
    getHiveResearchSession(input),
    listHiveResearchTimeline({
      filters: { limit: 500, researchSessionId: input.sessionId },
      isAdmin: input.isAdmin,
      serverId: input.serverId,
    }),
  ]);

  if (!session) return null;

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    serverId: input.serverId,
    session,
    timeline: timeline.items,
  };
}
