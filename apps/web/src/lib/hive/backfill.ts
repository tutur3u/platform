import type { Json } from '@tuturuuu/types/db';
import { asHiveJson, getHiveSql, normalizeWorld } from './hive-db';

type SupabaseHiveRow = Record<string, unknown>;

function stringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function numberOrZero(value: unknown) {
  return typeof value === 'number' ? value : 0;
}

export async function backfillHiveProductData(input: {
  events: SupabaseHiveRow[];
  members: SupabaseHiveRow[];
  memories: SupabaseHiveRow[];
  npcs: SupabaseHiveRow[];
  runs: SupabaseHiveRow[];
  servers: SupabaseHiveRow[];
  states: SupabaseHiveRow[];
}) {
  const sql = getHiveSql();

  return sql.begin(async (tx) => {
    for (const member of input.members) {
      await tx`
        insert into hive_members (id, user_id, enabled, notes, created_at, updated_at)
        values (
          ${stringOrNull(member.id)},
          ${stringOrNull(member.user_id)},
          ${member.enabled !== false},
          ${stringOrNull(member.notes)},
          coalesce(${stringOrNull(member.created_at)}::timestamptz, now()),
          coalesce(${stringOrNull(member.updated_at)}::timestamptz, now())
        )
        on conflict (user_id) do update set
          enabled = excluded.enabled,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `;
    }

    for (const server of input.servers) {
      await tx`
        insert into hive_servers (
          id, name, slug, description, enabled, max_players, created_by,
          created_at, updated_at
        )
        values (
          ${stringOrNull(server.id)},
          ${stringOrNull(server.name) ?? 'Hive Server'},
          ${stringOrNull(server.slug) ?? stringOrNull(server.id) ?? 'hive-server'},
          ${stringOrNull(server.description)},
          ${server.enabled !== false},
          ${numberOrZero(server.max_players) || 32},
          ${stringOrNull(server.created_by)},
          coalesce(${stringOrNull(server.created_at)}::timestamptz, now()),
          coalesce(${stringOrNull(server.updated_at)}::timestamptz, now())
        )
        on conflict (id) do update set
          name = excluded.name,
          slug = excluded.slug,
          description = excluded.description,
          enabled = excluded.enabled,
          max_players = excluded.max_players,
          updated_at = excluded.updated_at
      `;
    }

    for (const state of input.states) {
      await tx`
        insert into hive_world_states (
          server_id, op_seq, world_data, updated_by, updated_at
        )
        values (
          ${stringOrNull(state.server_id)},
          ${numberOrZero(state.revision)},
          ${tx.json(asHiveJson(normalizeWorld(state.world_data as Json)))},
          ${stringOrNull(state.updated_by)},
          coalesce(${stringOrNull(state.updated_at)}::timestamptz, now())
        )
        on conflict (server_id) do update set
          op_seq = greatest(hive_world_states.op_seq, excluded.op_seq),
          world_data = excluded.world_data,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `;
    }

    for (const event of input.events) {
      await tx`
        insert into hive_world_events (
          id, server_id, actor_user_id, op_seq, event_type, payload, created_at
        )
        values (
          ${stringOrNull(event.id)},
          ${stringOrNull(event.server_id)},
          ${stringOrNull(event.actor_user_id)},
          ${numberOrZero(event.revision)},
          ${stringOrNull(event.event_type) ?? 'legacy.backfill'},
          ${tx.json(asHiveJson((event.payload ?? {}) as Json))},
          coalesce(${stringOrNull(event.created_at)}::timestamptz, now())
        )
        on conflict (id) do nothing
      `;
    }

    for (const npc of input.npcs) {
      await tx`
        insert into hive_npcs (
          id, server_id, created_by, name, role, model, backstory,
          system_prompt, memory_enabled, backstory_enabled,
          custom_prompt_enabled, position, settings, created_at, updated_at
        )
        values (
          ${stringOrNull(npc.id)},
          ${stringOrNull(npc.server_id)},
          ${stringOrNull(npc.created_by)},
          ${stringOrNull(npc.name) ?? 'Hive NPC'},
          ${stringOrNull(npc.role) ?? 'resident'},
          ${stringOrNull(npc.model) ?? 'gemini-2.5-flash-lite'},
          ${stringOrNull(npc.backstory) ?? ''},
          ${stringOrNull(npc.system_prompt) ?? ''},
          ${npc.memory_enabled !== false},
          ${npc.backstory_enabled !== false},
          ${npc.custom_prompt_enabled === true},
          ${tx.json(asHiveJson((npc.position ?? { x: 0, y: 1, z: 0 }) as Json))},
          ${tx.json(asHiveJson((npc.settings ?? {}) as Json))},
          coalesce(${stringOrNull(npc.created_at)}::timestamptz, now()),
          coalesce(${stringOrNull(npc.updated_at)}::timestamptz, now())
        )
        on conflict (id) do update set
          name = excluded.name,
          role = excluded.role,
          model = excluded.model,
          backstory = excluded.backstory,
          system_prompt = excluded.system_prompt,
          memory_enabled = excluded.memory_enabled,
          backstory_enabled = excluded.backstory_enabled,
          custom_prompt_enabled = excluded.custom_prompt_enabled,
          position = excluded.position,
          settings = excluded.settings,
          updated_at = excluded.updated_at
      `;

      await tx`
        insert into hive_npc_wallets (npc_id)
        values (${stringOrNull(npc.id)})
        on conflict (npc_id) do nothing
      `;
      await tx`
        insert into hive_npc_needs (npc_id)
        values (${stringOrNull(npc.id)})
        on conflict (npc_id) do nothing
      `;
    }

    for (const memory of input.memories) {
      await tx`
        insert into hive_npc_memories (
          id, server_id, npc_id, created_by, content, importance, enabled,
          created_at
        )
        values (
          ${stringOrNull(memory.id)},
          ${stringOrNull(memory.server_id)},
          ${stringOrNull(memory.npc_id)},
          ${stringOrNull(memory.created_by)},
          ${stringOrNull(memory.content) ?? ''},
          ${numberOrZero(memory.importance) || 1},
          ${memory.enabled !== false},
          coalesce(${stringOrNull(memory.created_at)}::timestamptz, now())
        )
        on conflict (id) do nothing
      `;
    }

    for (const run of input.runs) {
      await tx`
        insert into hive_npc_runs (
          id, server_id, npc_id, actor_user_id, input_context,
          output_decision, created_at
        )
        values (
          ${stringOrNull(run.id)},
          ${stringOrNull(run.server_id)},
          ${stringOrNull(run.npc_id)},
          ${stringOrNull(run.actor_user_id)},
          ${tx.json(asHiveJson((run.input_context ?? {}) as Json))},
          ${tx.json(asHiveJson((run.output_decision ?? {}) as Json))},
          coalesce(${stringOrNull(run.created_at)}::timestamptz, now())
        )
        on conflict (id) do nothing
      `;
    }

    return {
      events: input.events.length,
      members: input.members.length,
      memories: input.memories.length,
      npcs: input.npcs.length,
      runs: input.runs.length,
      servers: input.servers.length,
      states: input.states.length,
    };
  });
}
