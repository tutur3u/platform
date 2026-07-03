import type { Json } from '@tuturuuu/types/db';
import { getHiveSql } from './hive-db';
import { ensureHiveResearchSchema } from './research-schema';
import type {
  HiveWorkflowDefinition,
  HiveWorkflowRow,
  HiveWorkflowRunRow,
  HiveWorkflowStepTrace,
} from './workflow-types';

let workflowSchemaPromise: Promise<void> | null = null;

export async function ensureHiveWorkflowSchema() {
  if (workflowSchemaPromise) return workflowSchemaPromise;

  const sql = getHiveSql();
  workflowSchemaPromise = (async () => {
    await sql`
      create table if not exists hive_workflows (
        id uuid primary key default gen_random_uuid(),
        server_id uuid not null references hive_servers(id) on update cascade on delete cascade,
        name text not null check (char_length(name) between 1 and 120),
        description text,
        enabled boolean not null default true,
        version integer not null default 1 check (version > 0),
        definition jsonb not null default '{"version":1,"nodes":[],"edges":[]}'::jsonb,
        created_by uuid,
        updated_by uuid,
        archived_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists hive_workflow_runs (
        id uuid primary key default gen_random_uuid(),
        workflow_id uuid not null references hive_workflows(id) on update cascade on delete cascade,
        server_id uuid not null references hive_servers(id) on update cascade on delete cascade,
        actor_user_id uuid,
        status text not null default 'running'
          check (status in ('running', 'completed', 'failed')),
        input jsonb not null default '{}'::jsonb,
        output jsonb not null default '{}'::jsonb,
        step_trace jsonb not null default '[]'::jsonb,
        error text,
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        created_at timestamptz not null default now()
      )
    `;
    await ensureHiveResearchSchema();
    await sql`
      create index if not exists hive_workflows_server_enabled_idx
      on hive_workflows (server_id, enabled, archived_at, updated_at desc)
    `;
    await sql`
      create index if not exists hive_workflow_runs_workflow_created_idx
      on hive_workflow_runs (workflow_id, created_at desc)
    `;
  })();

  try {
    await workflowSchemaPromise;
  } catch (error) {
    workflowSchemaPromise = null;
    throw error;
  }
}

function asJson(value: unknown): Json {
  return value === undefined ? null : (value as Json);
}

function parseDefinition(value: unknown): HiveWorkflowDefinition {
  const fallback: HiveWorkflowDefinition = { edges: [], nodes: [], version: 1 };
  if (!value || typeof value !== 'object') return fallback;

  const definition = value as Partial<HiveWorkflowDefinition>;
  return {
    edges: Array.isArray(definition.edges) ? definition.edges : [],
    nodes: Array.isArray(definition.nodes) ? definition.nodes : [],
    version: definition.version === 1 ? 1 : 1,
  };
}

function parseTrace(value: unknown): HiveWorkflowStepTrace[] {
  return Array.isArray(value) ? (value as HiveWorkflowStepTrace[]) : [];
}

export function mapHiveWorkflow(row: HiveWorkflowRow) {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    definition: parseDefinition(row.definition),
    description: row.description,
    enabled: row.enabled,
    id: row.id,
    name: row.name,
    serverId: row.server_id,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    version: row.version,
  };
}

export function mapHiveWorkflowRun(row: HiveWorkflowRunRow) {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    error: row.error,
    finishedAt: row.finished_at,
    id: row.id,
    input: asJson(row.input),
    output: asJson(row.output),
    researchSessionId: row.research_session_id ?? null,
    serverId: row.server_id,
    startedAt: row.started_at,
    status: row.status,
    stepTrace: parseTrace(row.step_trace),
    workflowId: row.workflow_id,
  };
}

export async function listHiveWorkflows(input: {
  isAdmin: boolean;
  serverId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const rows = input.isAdmin
    ? await sql<HiveWorkflowRow[]>`
        select id, server_id, name, description, enabled, version, definition,
          created_by, updated_by, archived_at, created_at, updated_at
        from hive_workflows
        where server_id = ${input.serverId}
          and archived_at is null
        order by updated_at desc, created_at desc
      `
    : await sql<HiveWorkflowRow[]>`
        select id, server_id, name, description, enabled, version, definition,
          created_by, updated_by, archived_at, created_at, updated_at
        from hive_workflows
        where server_id = ${input.serverId}
          and enabled = true
          and archived_at is null
        order by updated_at desc, created_at desc
      `;

  return rows.map(mapHiveWorkflow);
}

export async function getHiveWorkflow(input: {
  isAdmin?: boolean;
  serverId: string;
  workflowId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const [workflow] = await sql<HiveWorkflowRow[]>`
    select id, server_id, name, description, enabled, version, definition,
      created_by, updated_by, archived_at, created_at, updated_at
    from hive_workflows
    where id = ${input.workflowId}
      and server_id = ${input.serverId}
      and archived_at is null
      and (${input.isAdmin === true} or enabled = true)
    limit 1
  `;

  return workflow ? mapHiveWorkflow(workflow) : null;
}

export async function createHiveWorkflow(input: {
  actorUserId: string;
  definition: HiveWorkflowDefinition;
  description?: string | null;
  enabled: boolean;
  name: string;
  serverId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const [workflow] = await sql<HiveWorkflowRow[]>`
    insert into hive_workflows (
      server_id, name, description, enabled, definition, created_by, updated_by
    )
    values (
      ${input.serverId},
      ${input.name},
      ${input.description ?? null},
      ${input.enabled},
      ${sql.json(input.definition as unknown as Json)},
      ${input.actorUserId},
      ${input.actorUserId}
    )
    returning id, server_id, name, description, enabled, version, definition,
      created_by, updated_by, archived_at, created_at, updated_at
  `;
  return workflow ? mapHiveWorkflow(workflow) : null;
}

export async function updateHiveWorkflow(input: {
  actorUserId: string;
  definition?: HiveWorkflowDefinition;
  description?: string | null;
  enabled?: boolean;
  name?: string;
  serverId: string;
  workflowId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const [workflow] = await sql<HiveWorkflowRow[]>`
    update hive_workflows set
      name = case when ${input.name !== undefined}
        then ${input.name ?? ''} else name end,
      description = case when ${input.description !== undefined}
        then ${input.description ?? null} else description end,
      enabled = case when ${input.enabled !== undefined}
        then ${input.enabled ?? true} else enabled end,
      definition = case when ${input.definition !== undefined}
        then ${sql.json((input.definition ?? { edges: [], nodes: [], version: 1 }) as unknown as Json)}::jsonb
        else definition end,
      version = version + 1,
      updated_by = ${input.actorUserId},
      updated_at = now()
    where id = ${input.workflowId}
      and server_id = ${input.serverId}
      and archived_at is null
    returning id, server_id, name, description, enabled, version, definition,
      created_by, updated_by, archived_at, created_at, updated_at
  `;
  return workflow ? mapHiveWorkflow(workflow) : null;
}

export async function archiveHiveWorkflow(input: {
  actorUserId: string;
  serverId: string;
  workflowId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const [workflow] = await sql<HiveWorkflowRow[]>`
    update hive_workflows
    set archived_at = now(),
      updated_by = ${input.actorUserId},
      updated_at = now()
    where id = ${input.workflowId}
      and server_id = ${input.serverId}
      and archived_at is null
    returning id, server_id, name, description, enabled, version, definition,
      created_by, updated_by, archived_at, created_at, updated_at
  `;
  return workflow ? mapHiveWorkflow(workflow) : null;
}

export async function insertHiveWorkflowRun(input: {
  actorUserId: string;
  researchSessionId?: string | null;
  serverId: string;
  runInput: Record<string, unknown>;
  workflowId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const [run] = await sql<HiveWorkflowRunRow[]>`
    insert into hive_workflow_runs (
      workflow_id, server_id, actor_user_id, input, status,
      research_session_id
    )
    values (
      ${input.workflowId},
      ${input.serverId},
      ${input.actorUserId},
      ${sql.json(input.runInput as unknown as Json)},
      'running',
      ${input.researchSessionId ?? null}
    )
    returning id, workflow_id, server_id, actor_user_id, status, input, output,
      step_trace, error, research_session_id, started_at, finished_at,
      created_at
  `;
  return run ? mapHiveWorkflowRun(run) : null;
}

export async function finishHiveWorkflowRun(input: {
  error?: string | null;
  output: Json;
  runId: string;
  status: 'completed' | 'failed';
  trace: HiveWorkflowStepTrace[];
}) {
  const sql = getHiveSql();
  const [run] = await sql<HiveWorkflowRunRow[]>`
    update hive_workflow_runs
    set status = ${input.status},
      output = ${sql.json(input.output)},
      step_trace = ${sql.json(input.trace as unknown as Json)},
      error = ${input.error ?? null},
      finished_at = now()
    where id = ${input.runId}
    returning id, workflow_id, server_id, actor_user_id, status, input, output,
      step_trace, error, research_session_id, started_at, finished_at,
      created_at
  `;
  return run ? mapHiveWorkflowRun(run) : null;
}

export async function listHiveWorkflowRuns(input: {
  serverId: string;
  workflowId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const rows = await sql<HiveWorkflowRunRow[]>`
    select id, workflow_id, server_id, actor_user_id, status, input, output,
      step_trace, error, research_session_id, started_at, finished_at,
      created_at
    from hive_workflow_runs
    where server_id = ${input.serverId}
      and workflow_id = ${input.workflowId}
    order by created_at desc
    limit 50
  `;
  return rows.map(mapHiveWorkflowRun);
}

export async function getHiveWorkflowRun(input: {
  runId: string;
  serverId: string;
  workflowId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const [run] = await sql<HiveWorkflowRunRow[]>`
    select id, workflow_id, server_id, actor_user_id, status, input, output,
      step_trace, error, research_session_id, started_at, finished_at,
      created_at
    from hive_workflow_runs
    where id = ${input.runId}
      and server_id = ${input.serverId}
      and workflow_id = ${input.workflowId}
    limit 1
  `;
  return run ? mapHiveWorkflowRun(run) : null;
}
