import { asHiveJson, getHiveSql } from './hive-db';
import { ensureHiveResearchSchema } from './research-schema';
import type { HiveNpcRow, HiveNpcRunRow } from './types';

export async function createHiveNpc(input: {
  createdBy: string;
  npc: {
    backstory: string;
    backstoryEnabled: boolean;
    customPromptEnabled: boolean;
    memoryEnabled: boolean;
    model: string;
    name: string;
    position: Record<string, unknown>;
    role: string;
    settings: Record<string, unknown>;
    systemPrompt: string;
  };
  serverId: string;
}) {
  const sql = getHiveSql();
  return sql.begin(async (tx) => {
    const [npc] = await tx<HiveNpcRow[]>`
      insert into hive_npcs (
        server_id, created_by, name, role, model, backstory, system_prompt,
        memory_enabled, backstory_enabled, custom_prompt_enabled, position,
        settings
      )
      values (
        ${input.serverId},
        ${input.createdBy},
        ${input.npc.name},
        ${input.npc.role},
        ${input.npc.model},
        ${input.npc.backstory},
        ${input.npc.systemPrompt},
        ${input.npc.memoryEnabled},
        ${input.npc.backstoryEnabled},
        ${input.npc.customPromptEnabled},
        ${tx.json(asHiveJson(input.npc.position))},
        ${tx.json(asHiveJson(input.npc.settings))}
      )
      returning id, server_id, name, role, model, backstory, system_prompt,
        memory_enabled, backstory_enabled, custom_prompt_enabled, position,
        settings, status, created_at
    `;

    if (!npc) return null;

    await tx`insert into hive_npc_wallets (npc_id) values (${npc.id})`;
    await tx`insert into hive_npc_needs (npc_id) values (${npc.id})`;
    await tx`
      insert into hive_ledger_entries (server_id, actor_npc_id, amount, reason)
      values (${input.serverId}, ${npc.id}, 100, 'npc_spawn_grant')
    `;

    return npc;
  });
}

export async function updateHiveNpc(input: {
  npcId: string;
  patch: Partial<{
    backstory: string;
    backstoryEnabled: boolean;
    customPromptEnabled: boolean;
    memoryEnabled: boolean;
    model: string;
    name: string;
    position: Record<string, unknown>;
    role: string;
    settings: Record<string, unknown>;
    systemPrompt: string;
  }>;
  serverId: string;
}) {
  const sql = getHiveSql();
  const [npc] = await sql<HiveNpcRow[]>`
    update hive_npcs set
      backstory = case when ${input.patch.backstory !== undefined}
        then ${input.patch.backstory ?? ''} else backstory end,
      backstory_enabled = case when ${input.patch.backstoryEnabled !== undefined}
        then ${input.patch.backstoryEnabled ?? true} else backstory_enabled end,
      custom_prompt_enabled = case when ${input.patch.customPromptEnabled !== undefined}
        then ${input.patch.customPromptEnabled ?? false} else custom_prompt_enabled end,
      memory_enabled = case when ${input.patch.memoryEnabled !== undefined}
        then ${input.patch.memoryEnabled ?? true} else memory_enabled end,
      model = case when ${input.patch.model !== undefined}
        then coalesce(${input.patch.model ?? null}, model) else model end,
      name = case when ${input.patch.name !== undefined}
        then coalesce(${input.patch.name ?? null}, name) else name end,
      position = case when ${input.patch.position !== undefined}
        then ${sql.json(asHiveJson(input.patch.position ?? {}))}::jsonb else position end,
      role = case when ${input.patch.role !== undefined}
        then coalesce(${input.patch.role ?? null}, role) else role end,
      settings = case when ${input.patch.settings !== undefined}
        then ${sql.json(asHiveJson(input.patch.settings ?? {}))}::jsonb else settings end,
      system_prompt = case when ${input.patch.systemPrompt !== undefined}
        then ${input.patch.systemPrompt ?? ''} else system_prompt end,
      updated_at = now()
    where id = ${input.npcId} and server_id = ${input.serverId}
    returning id, server_id, name, role, model, backstory, system_prompt,
      memory_enabled, backstory_enabled, custom_prompt_enabled, position,
      settings, status, created_at
  `;
  return npc ?? null;
}

export async function deleteHiveNpc(input: {
  npcId: string;
  serverId: string;
}) {
  const sql = getHiveSql();
  await sql`
    delete from hive_npcs
    where id = ${input.npcId} and server_id = ${input.serverId}
  `;
}

export async function getHiveNpc(input: { npcId: string; serverId: string }) {
  const sql = getHiveSql();
  const [npc] = await sql<HiveNpcRow[]>`
    select id, server_id, name, role, model, backstory, system_prompt,
      memory_enabled, backstory_enabled, custom_prompt_enabled, position,
      settings, status, created_at
    from hive_npcs
    where id = ${input.npcId} and server_id = ${input.serverId}
    limit 1
  `;
  return npc ?? null;
}

export async function listHiveNpcMemories(npcId: string) {
  const sql = getHiveSql();
  return sql<Array<{ content: string; importance: number }>>`
    select content, importance
    from hive_npc_memories
    where npc_id = ${npcId} and enabled = true
    order by importance desc
    limit 12
  `;
}

export async function persistHiveNpcRun(input: {
  actorUserId: string | null;
  autonomous?: boolean;
  creditSource?: 'personal' | 'workspace' | null;
  creditWsId?: string | null;
  creditsDeducted?: number;
  decision: Record<string, unknown>;
  error?: string | null;
  inputContext: Record<string, unknown>;
  inputTokens?: number;
  interactionId?: string | null;
  llmCost: number;
  llmModel: string | null;
  llmProvider: string;
  npcId: string;
  outputTokens?: number;
  promptMode: string;
  researchSessionId?: string | null;
  reasoningTokens?: number;
  serverId: string;
  status?: 'completed' | 'failed' | 'running' | 'skipped';
  targetNpcId?: string | null;
  trigger?: 'autonomous' | 'cron' | 'manual' | 'simulation' | 'workflow';
}) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();
  const [run] = await sql<HiveNpcRunRow[]>`
    insert into hive_npc_runs (
      server_id, npc_id, actor_user_id, prompt_mode, input_context,
      output_decision, interaction_id, target_npc_id, trigger, status, error,
      llm_provider, llm_model, llm_cost, input_tokens, output_tokens,
      reasoning_tokens, credits_deducted, credit_ws_id, credit_source,
      autonomous, research_session_id
    )
    values (
      ${input.serverId},
      ${input.npcId},
      ${input.actorUserId},
      ${input.promptMode},
      ${sql.json(asHiveJson(input.inputContext))},
      ${sql.json(asHiveJson(input.decision))},
      ${input.interactionId ?? null},
      ${input.targetNpcId ?? null},
      ${input.trigger ?? 'manual'},
      ${input.status ?? 'completed'},
      ${input.error ?? null},
      ${input.llmProvider},
      ${input.llmModel},
      ${input.llmCost},
      ${input.inputTokens ?? 0},
      ${input.outputTokens ?? 0},
      ${input.reasoningTokens ?? 0},
      ${input.creditsDeducted ?? 0},
      ${input.creditWsId ?? null},
      ${input.creditSource ?? null},
      ${input.autonomous ?? false},
      ${input.researchSessionId ?? null}
    )
    returning id, server_id, npc_id, actor_user_id, prompt_mode, input_context,
      output_decision, interaction_id, target_npc_id, trigger, status, error,
      llm_provider, llm_model, llm_cost, input_tokens, output_tokens,
      reasoning_tokens, credits_deducted, credit_ws_id, credit_source,
      autonomous, research_session_id, created_at
  `;
  return run ?? null;
}

export async function listHiveNpcRuns(input: {
  limit?: number;
  serverId: string;
}) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();
  return sql<HiveNpcRunRow[]>`
    select runs.id, runs.server_id, runs.npc_id, runs.actor_user_id,
      runs.prompt_mode, runs.input_context, runs.output_decision,
      runs.interaction_id, runs.target_npc_id, runs.trigger, runs.status,
      runs.error, runs.llm_provider, runs.llm_model, runs.llm_cost,
      runs.input_tokens, runs.output_tokens, runs.reasoning_tokens,
      runs.credits_deducted, runs.credit_ws_id, runs.credit_source,
      runs.autonomous, runs.created_at, source.name as npc_name,
      runs.research_session_id, target.name as target_npc_name
    from hive_npc_runs runs
    left join hive_npcs source on source.id = runs.npc_id
    left join hive_npcs target on target.id = runs.target_npc_id
    where runs.server_id = ${input.serverId}
    order by runs.created_at desc
    limit ${Math.min(Math.max(input.limit ?? 120, 1), 240)}
  `;
}

export async function getLatestHiveNpcAutonomousRun(input: {
  npcIds: string[];
  serverId: string;
}) {
  if (input.npcIds.length === 0) return null;

  const sql = getHiveSql();
  const [run] = await sql<Array<{ created_at: string }>>`
    select created_at
    from hive_npc_runs
    where server_id = ${input.serverId}
      and autonomous = true
      and (
        npc_id = any(${sql.array(input.npcIds)})
        or target_npc_id = any(${sql.array(input.npcIds)})
      )
    order by created_at desc
    limit 1
  `;

  return run ?? null;
}

export async function appendHiveNpcMemories(input: {
  contents: string[];
  createdBy: string;
  npcId: string;
  runId: string;
  serverId: string;
}) {
  const sql = getHiveSql();
  for (const content of input.contents) {
    await sql`
      insert into hive_npc_memories (
        server_id, npc_id, source_run_id, created_by, content, importance
      )
      values (
        ${input.serverId},
        ${input.npcId},
        ${input.runId},
        ${input.createdBy},
        ${content},
        3
      )
    `;
  }
}
