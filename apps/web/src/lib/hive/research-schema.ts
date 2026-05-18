import { asHiveJson, getHiveSql } from './hive-db';
import type { HiveResearchSessionEventRow } from './types';

let researchSchemaPromise: Promise<void> | null = null;

export async function ensureHiveResearchSchema() {
  if (researchSchemaPromise) return researchSchemaPromise;

  const sql = getHiveSql();
  researchSchemaPromise = (async () => {
    await sql`
      create table if not exists hive_research_sessions (
        id uuid primary key default gen_random_uuid(),
        server_id uuid not null references hive_servers(id) on update cascade on delete cascade,
        name text not null check (char_length(name) between 1 and 160),
        description text,
        status text not null default 'running'
          check (status in ('running', 'paused', 'completed', 'archived')),
        created_by uuid,
        started_at timestamptz not null default now(),
        ended_at timestamptz,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create unique index if not exists hive_research_sessions_one_running_idx
      on hive_research_sessions (server_id)
      where status = 'running'
    `;
    await sql`
      create index if not exists hive_research_sessions_server_created_idx
      on hive_research_sessions (server_id, created_at desc)
    `;
    await sql`
      create table if not exists hive_research_session_events (
        id uuid primary key default gen_random_uuid(),
        session_id uuid not null references hive_research_sessions(id) on update cascade on delete cascade,
        server_id uuid not null references hive_servers(id) on update cascade on delete cascade,
        actor_user_id uuid,
        event_kind text not null,
        source_type text not null default 'system',
        source_id uuid,
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create index if not exists hive_research_session_events_session_created_idx
      on hive_research_session_events (session_id, created_at desc)
    `;
    await sql`
      create index if not exists hive_research_session_events_server_created_idx
      on hive_research_session_events (server_id, created_at desc)
    `;
    await sql`
      alter table hive_world_events
      add column if not exists research_session_id uuid
      references hive_research_sessions(id) on update cascade on delete set null
    `;
    await sql`
      alter table hive_npc_runs
      add column if not exists research_session_id uuid
      references hive_research_sessions(id) on update cascade on delete set null
    `;
    await sql`
      alter table if exists hive_workflow_runs
      add column if not exists research_session_id uuid
      references hive_research_sessions(id) on update cascade on delete set null
    `;
    await sql`
      alter table if exists hive_simulation_ticks
      add column if not exists research_session_id uuid
      references hive_research_sessions(id) on update cascade on delete set null
    `;
    await sql`
      create index if not exists hive_world_events_research_session_created_idx
      on hive_world_events (research_session_id, created_at desc)
      where research_session_id is not null
    `;
    await sql`
      create index if not exists hive_npc_runs_research_session_created_idx
      on hive_npc_runs (research_session_id, created_at desc)
      where research_session_id is not null
    `;
    await sql`
      create index if not exists hive_workflow_runs_research_session_created_idx
      on hive_workflow_runs (research_session_id, created_at desc)
      where research_session_id is not null
    `.catch(() => undefined);
    await sql`
      create index if not exists hive_simulation_ticks_research_session_started_idx
      on hive_simulation_ticks (research_session_id, started_at desc)
      where research_session_id is not null
    `.catch(() => undefined);
  })();

  try {
    await researchSchemaPromise;
  } catch (error) {
    researchSchemaPromise = null;
    throw error;
  }
}

export async function resolveHiveResearchSessionId(input: {
  researchSessionId?: string | null;
  serverId: string;
}) {
  await ensureHiveResearchSchema();

  if (input.researchSessionId) return input.researchSessionId;

  const sql = getHiveSql();
  const [session] = await sql<Array<{ id: string }>>`
    select id
    from hive_research_sessions
    where server_id = ${input.serverId}
      and status = 'running'
    order by started_at desc
    limit 1
  `;

  return session?.id ?? null;
}

export async function appendHiveResearchSessionEvent(input: {
  actorUserId: string | null;
  eventKind: string;
  payload?: Record<string, unknown>;
  serverId: string;
  sessionId: string;
  sourceId?: string | null;
  sourceType: string;
}) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();
  const [event] = await sql<HiveResearchSessionEventRow[]>`
    insert into hive_research_session_events (
      session_id, server_id, actor_user_id, event_kind, source_type, source_id,
      payload
    )
    values (
      ${input.sessionId},
      ${input.serverId},
      ${input.actorUserId},
      ${input.eventKind},
      ${input.sourceType},
      ${input.sourceId ?? null},
      ${sql.json(asHiveJson(input.payload ?? {}))}
    )
    returning id, session_id, server_id, actor_user_id, event_kind,
      source_type, source_id, payload, created_at
  `;

  return event ?? null;
}
