import type { Json } from '@tuturuuu/types/db';
import {
  acceptHiveTradeOffer,
  createHiveTradeOffer,
  createHiveWarehouse,
  runHiveFarmingAction,
  transferHiveInventory,
} from './economy';
import {
  createHiveWorldEvent,
  getHiveSnapshot,
  getHiveSql,
  normalizeWorld,
} from './hive-db';
import { getHiveNpc, persistHiveNpcRun, updateHiveNpc } from './npcs';
import { runHiveSimulationTick } from './simulation';
import {
  executeHiveWorkflowDefinition,
  validateHiveWorkflowDefinition,
} from './workflow-engine';
import type {
  HiveWorkflowDefinition,
  HiveWorkflowRow,
  HiveWorkflowRunRow,
  HiveWorkflowStepTrace,
} from './workflow-types';

let workflowSchemaPromise: Promise<void> | null = null;

async function ensureHiveWorkflowSchema() {
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
    serverId: row.server_id,
    startedAt: row.started_at,
    status: row.status,
    stepTrace: parseTrace(row.step_trace),
    workflowId: row.workflow_id,
  };
}

export function validateHiveWorkflowForPersistence(
  definition: HiveWorkflowDefinition
) {
  return validateHiveWorkflowDefinition(definition);
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

async function insertHiveWorkflowRun(input: {
  actorUserId: string;
  workflowId: string;
  serverId: string;
  runInput: Record<string, unknown>;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const [run] = await sql<HiveWorkflowRunRow[]>`
    insert into hive_workflow_runs (
      workflow_id, server_id, actor_user_id, input, status
    )
    values (
      ${input.workflowId},
      ${input.serverId},
      ${input.actorUserId},
      ${sql.json(input.runInput as unknown as Json)},
      'running'
    )
    returning id, workflow_id, server_id, actor_user_id, status, input, output,
      step_trace, error, started_at, finished_at, created_at
  `;
  return run ? mapHiveWorkflowRun(run) : null;
}

async function finishHiveWorkflowRun(input: {
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
      step_trace, error, started_at, finished_at, created_at
  `;
  return run ? mapHiveWorkflowRun(run) : null;
}

async function getWorkflowSnapshot(serverId: string) {
  const snapshot = await getHiveSnapshot(serverId);
  return {
    crops: snapshot.crops,
    economy: {
      inventories: snapshot.inventories,
      totalCurrency: Number(snapshot.server?.total_currency ?? 0),
      warehouses: snapshot.warehouses,
    },
    events: snapshot.events,
    npcs: snapshot.npcs,
    revision: Number(snapshot.state?.op_seq ?? snapshot.state?.revision ?? 0),
    server: snapshot.server,
    world: normalizeWorld(snapshot.state?.world_data as Json),
  };
}

export async function runHiveWorkflow(input: {
  actorUserId: string;
  input?: Record<string, unknown>;
  isAdmin: boolean;
  serverId: string;
  workflowId: string;
}) {
  const workflow = await getHiveWorkflow(input);
  if (!workflow) return null;

  const run = await insertHiveWorkflowRun({
    actorUserId: input.actorUserId,
    runInput: input.input ?? {},
    serverId: input.serverId,
    workflowId: input.workflowId,
  });
  if (!run) return null;

  const result = await executeHiveWorkflowDefinition({
    actorUserId: input.actorUserId,
    capabilities: {
      createHiveWorldEvent: async (payload) => {
        const snapshot = await getWorkflowSnapshot(input.serverId);
        const event = await createHiveWorldEvent({
          actorUserId: input.actorUserId,
          eventType:
            typeof payload.eventType === 'string'
              ? payload.eventType
              : 'workflow.event',
          payload: {
            ...(payload.payload &&
            typeof payload.payload === 'object' &&
            !Array.isArray(payload.payload)
              ? (payload.payload as Record<string, unknown>)
              : {}),
            workflowId: input.workflowId,
            workflowRunId: run.id,
          },
          serverId: input.serverId,
          world: normalizeWorld((payload.world as Json) ?? snapshot.world),
        });
        return event;
      },
      createTradeOffer: (payload) =>
        createHiveTradeOffer({
          expiresAt:
            typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
          fromNpcId: String(payload.fromNpcId ?? ''),
          offeredCurrency: Number(payload.offeredCurrency ?? 0),
          offeredItems: (payload.offeredItems ?? []) as Json,
          requestedCurrency: Number(payload.requestedCurrency ?? 0),
          requestedItems: (payload.requestedItems ?? []) as Json,
          serverId: input.serverId,
          toNpcId: typeof payload.toNpcId === 'string' ? payload.toNpcId : null,
        }),
      createWarehouse: (payload) =>
        createHiveWarehouse({
          capacity: Number(payload.capacity ?? 500),
          name: String(payload.name ?? 'Workflow warehouse'),
          position:
            payload.position &&
            typeof payload.position === 'object' &&
            !Array.isArray(payload.position)
              ? (payload.position as { x: number; y: number; z: number })
              : { x: 0, y: 1, z: 0 },
          serverId: input.serverId,
        }),
      getSnapshot: getWorkflowSnapshot,
      persistNpcDecision: async (payload) => {
        const npcId = String(payload.npcId ?? '');
        if (!npcId) throw new Error('npc_decision nodes require npcId.');

        const npc = await getHiveNpc({ npcId, serverId: input.serverId });
        if (!npc) throw new Error('NPC not found.');

        const snapshot = await getWorkflowSnapshot(input.serverId);
        const decision = {
          action: { type: 'work' },
          intent: String(
            payload.intent ?? `Run workflow action for ${npc.name}`
          ),
          memoryWrites: [],
          rationale: `Manual workflow ${workflow.name} ran for ${npc.name}.`,
          spokenText: String(payload.spokenText ?? ''),
        };
        const npcRun = await persistHiveNpcRun({
          actorUserId: input.actorUserId,
          decision,
          inputContext: {
            workflowId: input.workflowId,
            workflowRunId: run.id,
          },
          llmCost: 0,
          llmModel: npc.model,
          llmProvider: 'workflow',
          npcId,
          promptMode: 'workflow',
          serverId: input.serverId,
        });

        await createHiveWorldEvent({
          actorUserId: input.actorUserId,
          eventType: 'npc.decision',
          payload: {
            decision,
            npcId,
            runId: npcRun?.id,
            workflowId: input.workflowId,
            workflowRunId: run.id,
          },
          serverId: input.serverId,
          world: snapshot.world,
        });

        return { decision, run: npcRun };
      },
      runFarmingAction: (payload) =>
        runHiveFarmingAction({
          action:
            payload.action === 'water' || payload.action === 'harvest'
              ? payload.action
              : 'plant',
          actorUserId: input.actorUserId,
          cropId:
            typeof payload.cropId === 'string' ? payload.cropId : undefined,
          cropType:
            typeof payload.cropType === 'string' ? payload.cropType : undefined,
          npcId: typeof payload.npcId === 'string' ? payload.npcId : undefined,
          position:
            payload.position &&
            typeof payload.position === 'object' &&
            !Array.isArray(payload.position)
              ? (payload.position as { x: number; y: number; z: number })
              : undefined,
          serverId: input.serverId,
        }),
      runSimulationTick: () =>
        runHiveSimulationTick({ force: true, serverId: input.serverId }),
      runTradeAccept: (payload) =>
        acceptHiveTradeOffer({
          acceptingNpcId: String(payload.acceptingNpcId ?? ''),
          serverId: input.serverId,
          tradeId: String(payload.tradeId ?? ''),
        }),
      transferInventory: (payload) =>
        transferHiveInventory({
          fromOwnerId: String(payload.fromOwnerId ?? ''),
          fromOwnerType:
            payload.fromOwnerType === 'warehouse' ? 'warehouse' : 'npc',
          itemType: String(payload.itemType ?? ''),
          quantity: Number(payload.quantity ?? 1),
          serverId: input.serverId,
          toOwnerId: String(payload.toOwnerId ?? ''),
          toOwnerType:
            payload.toOwnerType === 'warehouse' ? 'warehouse' : 'npc',
        }),
      updateNpc: (npcId, patch) =>
        updateHiveNpc({
          npcId,
          patch,
          serverId: input.serverId,
        }),
    },
    definition: workflow.definition,
    input: input.input,
    serverId: input.serverId,
  });

  return finishHiveWorkflowRun({
    error: result.error ?? null,
    output: result.output,
    runId: run.id,
    status: result.status,
    trace: result.trace,
  });
}

export async function listHiveWorkflowRuns(input: {
  serverId: string;
  workflowId: string;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();
  const rows = await sql<HiveWorkflowRunRow[]>`
    select id, workflow_id, server_id, actor_user_id, status, input, output,
      step_trace, error, started_at, finished_at, created_at
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
      step_trace, error, started_at, finished_at, created_at
    from hive_workflow_runs
    where id = ${input.runId}
      and server_id = ${input.serverId}
      and workflow_id = ${input.workflowId}
    limit 1
  `;
  return run ? mapHiveWorkflowRun(run) : null;
}
