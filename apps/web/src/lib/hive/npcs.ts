import type { Json } from '@tuturuuu/types/db';
import { asHiveJson, getHiveSql } from './hive-db';
import type { HiveNpcRow } from './types';

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
  actorUserId: string;
  decision: Record<string, unknown>;
  inputContext: Record<string, unknown>;
  llmCost: number;
  llmModel: string | null;
  llmProvider: string;
  npcId: string;
  promptMode: string;
  serverId: string;
}) {
  const sql = getHiveSql();
  const [run] = await sql<
    Array<{
      created_at: string;
      id: string;
      input_context: Json;
      npc_id: string;
      output_decision: Json;
    }>
  >`
    insert into hive_npc_runs (
      server_id, npc_id, actor_user_id, prompt_mode, input_context,
      output_decision, llm_provider, llm_model, llm_cost
    )
    values (
      ${input.serverId},
      ${input.npcId},
      ${input.actorUserId},
      ${input.promptMode},
      ${sql.json(asHiveJson(input.inputContext))},
      ${sql.json(asHiveJson(input.decision))},
      ${input.llmProvider},
      ${input.llmModel},
      ${input.llmCost}
    )
    returning id, npc_id, input_context, output_decision, created_at
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
