import type { Json } from '@tuturuuu/types/db';
import { getHiveSql } from './hive-db';
import { ensureHiveResearchSchema } from './research-schema';
import type {
  HiveNpcRunRow,
  HiveResearchSessionEventRow,
  HiveSimulationTickRow,
  HiveWorldEventRow,
} from './types';
import type { HiveWorkflowRunRow } from './workflow-types';

export type HiveResearchTimelineFilters = {
  actorUserId?: string | null;
  eventType?: string | null;
  limit?: number;
  npcId?: string | null;
  researchSessionId?: string | null;
  status?: string | null;
  trigger?: string | null;
  workflowId?: string | null;
};

type WorkflowRunTimelineRow = HiveWorkflowRunRow & {
  workflow_name: string | null;
};

function asJson(value: unknown): Json {
  return value === undefined ? null : (value as Json);
}

function parseTrace(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function mapEvent(row: HiveWorldEventRow) {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    kind: 'event' as const,
    payload: asJson(row.payload),
    researchSessionId: row.research_session_id ?? null,
    revision: Number(row.op_seq ?? row.revision ?? 0),
  };
}

function mapNpcRun(row: HiveNpcRunRow) {
  return {
    actorUserId: row.actor_user_id,
    autonomous: row.autonomous === true,
    creditSource: row.credit_source,
    creditWsId: row.credit_ws_id,
    creditsDeducted: Number(row.credits_deducted ?? 0),
    createdAt: row.created_at,
    error: row.error,
    id: row.id,
    inputContext: asJson(row.input_context),
    inputTokens: Number(row.input_tokens ?? 0),
    interactionId: row.interaction_id,
    kind: 'run' as const,
    llmCost: Number(row.llm_cost ?? 0),
    llmModel: row.llm_model,
    llmProvider: row.llm_provider,
    npcId: row.npc_id,
    npcName: row.npc_name ?? null,
    outputDecision: asJson(row.output_decision),
    outputTokens: Number(row.output_tokens ?? 0),
    promptMode: row.prompt_mode,
    reasoningTokens: Number(row.reasoning_tokens ?? 0),
    researchSessionId: row.research_session_id ?? null,
    status: row.status ?? 'completed',
    targetNpcId: row.target_npc_id,
    targetNpcName: row.target_npc_name ?? null,
    trigger: row.trigger ?? 'manual',
  };
}

function mapWorkflowRun(row: WorkflowRunTimelineRow) {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    error: row.error,
    finishedAt: row.finished_at,
    id: row.id,
    input: asJson(row.input),
    kind: 'workflow_run' as const,
    output: asJson(row.output),
    researchSessionId: row.research_session_id ?? null,
    serverId: row.server_id,
    startedAt: row.started_at,
    status: row.status,
    stepTrace: parseTrace(row.step_trace),
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
  };
}

function mapSimulationTick(row: HiveSimulationTickRow) {
  return {
    actionsCount: row.actions_count,
    createdAt: row.started_at,
    error: row.error,
    finishedAt: row.finished_at,
    id: row.id,
    kind: 'simulation_tick' as const,
    llmSpend: Number(row.llm_spend ?? 0),
    researchSessionId: row.research_session_id ?? null,
    serverId: row.server_id,
    startedAt: row.started_at,
    status: row.status,
    summary: asJson(row.summary),
  };
}

function mapSessionEvent(row: HiveResearchSessionEventRow) {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    eventKind: row.event_kind,
    id: row.id,
    kind: 'session_event' as const,
    payload: asJson(row.payload),
    researchSessionId: row.session_id,
    serverId: row.server_id,
    sessionId: row.session_id,
    sourceId: row.source_id,
    sourceType: row.source_type,
  };
}

function aggregateStatus(runs: ReturnType<typeof mapNpcRun>[]) {
  if (runs.some((run) => run.status === 'failed')) return 'failed';
  if (runs.some((run) => run.status === 'running')) return 'running';
  if (runs.every((run) => run.status === 'skipped')) return 'skipped';
  return 'completed';
}

function groupNpcRuns(runs: ReturnType<typeof mapNpcRun>[]) {
  const grouped = new Map<string, ReturnType<typeof mapNpcRun>[]>();
  const standalone: ReturnType<typeof mapNpcRun>[] = [];

  for (const run of runs) {
    if (!run.interactionId) {
      standalone.push(run);
      continue;
    }
    grouped.set(run.interactionId, [
      ...(grouped.get(run.interactionId) ?? []),
      run,
    ]);
  }

  const interactions = Array.from(grouped.entries()).map(
    ([interactionId, group]) => {
      const sortedRuns = [...group].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const latestRun = sortedRuns.reduce((latest, run) =>
        new Date(run.createdAt).getTime() > new Date(latest.createdAt).getTime()
          ? run
          : latest
      );
      const firstRun = sortedRuns[0] ?? latestRun;

      return {
        actorUserId: firstRun.actorUserId,
        autonomous: sortedRuns.some((run) => run.autonomous),
        createdAt: latestRun.createdAt,
        creditSource: firstRun.creditSource,
        creditWsId: firstRun.creditWsId,
        creditsDeducted: sortedRuns.reduce(
          (sum, run) => sum + run.creditsDeducted,
          0
        ),
        id: interactionId,
        interactionId,
        kind: 'interaction' as const,
        llmCost: sortedRuns.reduce((sum, run) => sum + run.llmCost, 0),
        llmModel: firstRun.llmModel,
        llmProvider: firstRun.llmProvider,
        npcName: firstRun.npcName,
        researchSessionId: firstRun.researchSessionId,
        runs: sortedRuns,
        status: aggregateStatus(sortedRuns),
        targetNpcName: firstRun.targetNpcName,
        trigger: firstRun.trigger,
      };
    }
  );

  return [...interactions, ...standalone];
}

export async function listHiveResearchTimeline(input: {
  filters?: HiveResearchTimelineFilters;
  isAdmin?: boolean;
  serverId: string;
}) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();
  const isAdmin = input.isAdmin === true;
  const limit = Math.min(Math.max(input.filters?.limit ?? 180, 1), 500);
  const sessionId = input.filters?.researchSessionId ?? null;
  const trigger = input.filters?.trigger ?? null;
  const status = input.filters?.status ?? null;
  const eventType = input.filters?.eventType ?? null;
  const actorUserId = input.filters?.actorUserId ?? null;
  const npcId = input.filters?.npcId ?? null;
  const workflowId = input.filters?.workflowId ?? null;

  const [events, runs, workflowRuns, ticks, sessionEvents] = await Promise.all([
    sql<HiveWorldEventRow[]>`
      select id, server_id, actor_user_id, op_seq, revision, event_type,
        payload, research_session_id, created_at
      from hive_world_events
      where server_id = ${input.serverId}
        and (${sessionId}::uuid is null or research_session_id = ${sessionId})
        and (${eventType}::text is null or event_type = ${eventType})
        and (${actorUserId}::uuid is null or actor_user_id = ${actorUserId})
      order by created_at desc
      limit ${limit}
    `,
    sql<HiveNpcRunRow[]>`
      select runs.id, runs.server_id, runs.npc_id, runs.actor_user_id,
        runs.prompt_mode, runs.input_context, runs.output_decision,
        runs.interaction_id, runs.target_npc_id, runs.trigger, runs.status,
        runs.error, runs.llm_provider, runs.llm_model, runs.llm_cost,
        runs.input_tokens, runs.output_tokens, runs.reasoning_tokens,
        runs.credits_deducted, runs.credit_ws_id, runs.credit_source,
        runs.autonomous, runs.research_session_id, runs.created_at,
        source.name as npc_name, target.name as target_npc_name
      from hive_npc_runs runs
      left join hive_npcs source on source.id = runs.npc_id
      left join hive_npcs target on target.id = runs.target_npc_id
      where runs.server_id = ${input.serverId}
        and (${sessionId}::uuid is null or runs.research_session_id = ${sessionId})
        and (${trigger}::text is null or runs.trigger = ${trigger})
        and (${status}::text is null or runs.status = ${status})
        and (${actorUserId}::uuid is null or runs.actor_user_id = ${actorUserId})
        and (${npcId}::uuid is null or runs.npc_id = ${npcId} or runs.target_npc_id = ${npcId})
      order by runs.created_at desc
      limit ${limit}
    `,
    sql<WorkflowRunTimelineRow[]>`
      select runs.id, runs.workflow_id, runs.server_id, runs.actor_user_id,
        runs.status, runs.input, runs.output, runs.step_trace, runs.error,
        runs.started_at, runs.finished_at, runs.created_at,
        runs.research_session_id, workflows.name as workflow_name
      from hive_workflow_runs runs
      join hive_workflows workflows
        on workflows.id = runs.workflow_id
        and workflows.server_id = runs.server_id
      where runs.server_id = ${input.serverId}
        and workflows.archived_at is null
        and (${isAdmin} or workflows.enabled = true)
        and (${sessionId}::uuid is null or runs.research_session_id = ${sessionId})
        and (${status}::text is null or runs.status = ${status})
        and (${actorUserId}::uuid is null or runs.actor_user_id = ${actorUserId})
        and (${workflowId}::uuid is null or runs.workflow_id = ${workflowId})
      order by runs.created_at desc
      limit ${limit}
    `.catch(() => []),
    sql<HiveSimulationTickRow[]>`
      select id, server_id, research_session_id, started_at, finished_at,
        status, actions_count, llm_spend, summary, error
      from hive_simulation_ticks
      where server_id = ${input.serverId}
        and (${sessionId}::uuid is null or research_session_id = ${sessionId})
        and (${status}::text is null or status = ${status})
      order by started_at desc
      limit ${limit}
    `.catch(() => []),
    sql<HiveResearchSessionEventRow[]>`
      select id, session_id, server_id, actor_user_id, event_kind, source_type,
        source_id, payload, created_at
      from hive_research_session_events
      where server_id = ${input.serverId}
        and (${sessionId}::uuid is null or session_id = ${sessionId})
        and (${eventType}::text is null or event_kind = ${eventType})
        and (${actorUserId}::uuid is null or actor_user_id = ${actorUserId})
      order by created_at desc
      limit ${limit}
    `,
  ]);

  const items = [
    ...events.map(mapEvent),
    ...groupNpcRuns(runs.map(mapNpcRun)),
    ...workflowRuns.map(mapWorkflowRun),
    ...ticks.map(mapSimulationTick),
    ...sessionEvents.map(mapSessionEvent),
  ]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, limit);

  return { items };
}
