import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { asHiveJson, getHiveSql } from './hive-db';
import { runHiveNpcInteraction } from './npc-interactions';
import { getLatestHiveNpcAutonomousRun } from './npcs';
import {
  ensureHiveResearchSchema,
  resolveHiveResearchSessionId,
} from './research-schema';
import type { HiveNpcRow, HiveWorld } from './types';

type SimulationServerSettings = {
  autonomousNpcEnabled?: boolean;
  defaultCreditSource?: 'personal' | 'workspace';
  defaultCreditWsId?: string | null;
  defaultModel?: string | null;
  maxAutonomousInteractionsPerTick?: number;
  maxInteractionTurns?: number;
  maxLlmSpendPerTick?: number;
  minInteractionCooldownSeconds?: number;
  simulationCronEnabled?: boolean;
};

function normalizeSettings(value: Record<string, unknown>) {
  return value as SimulationServerSettings;
}

function asWorld(value: unknown): HiveWorld {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { blocks: [], objects: [] };
  }

  const world = value as Partial<HiveWorld>;
  return {
    blocks: Array.isArray(world.blocks) ? world.blocks : [],
    objects: Array.isArray(world.objects) ? world.objects : [],
  };
}

function asPosition(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number' &&
    typeof (value as { z?: unknown }).z === 'number'
  ) {
    return value as { x: number; y: number; z: number };
  }

  return { x: 0, y: 1, z: 0 };
}

function distance(a: unknown, b: unknown) {
  const from = asPosition(a);
  const to = asPosition(b);

  return (
    Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.z - to.z)
  );
}

function isAutonomousNpc(npc: HiveNpcRow) {
  return (
    npc.settings &&
    typeof npc.settings === 'object' &&
    !Array.isArray(npc.settings) &&
    (npc.settings as { autonomous?: unknown }).autonomous === true
  );
}

async function runAutonomousNpcInteractions(input: {
  actorUserId: string | null;
  researchSessionId?: string | null;
  serverId: string;
  settings: SimulationServerSettings;
}) {
  const settings = input.settings;
  if (!settings.autonomousNpcEnabled) return 0;
  if (!input.actorUserId || !settings.defaultCreditWsId) return 0;

  const sql = getHiveSql();
  const [[state], npcs] = await Promise.all([
    sql<Array<{ revision: string | number; world_data: unknown }>>`
      select revision, world_data
      from hive_world_states
      where server_id = ${input.serverId}
      limit 1
    `,
    sql<HiveNpcRow[]>`
      select id, server_id, name, role, model, backstory, system_prompt,
        memory_enabled, backstory_enabled, custom_prompt_enabled, position,
        settings, status, created_at
      from hive_npcs
      where server_id = ${input.serverId} and status = 'active'
      order by created_at asc
    `,
  ]);
  const autonomousNpcs = npcs.filter(isAutonomousNpc);

  if (autonomousNpcs.length < 2) return 0;

  const maxInteractions = Math.min(
    Math.max(settings.maxAutonomousInteractionsPerTick ?? 1, 0),
    20
  );
  const maxTurns = Math.min(Math.max(settings.maxInteractionTurns ?? 4, 1), 12);
  const cooldownMs =
    Math.max(settings.minInteractionCooldownSeconds ?? 900, 0) * 1000;
  const maxSpend = Math.max(settings.maxLlmSpendPerTick ?? 0, 0);
  let interactions = 0;
  let creditsSpent = 0;

  for (const sourceNpc of autonomousNpcs) {
    if (interactions >= maxInteractions) break;
    if (maxSpend > 0 && creditsSpent >= maxSpend) break;

    const targetNpc =
      autonomousNpcs
        .filter((npc) => npc.id !== sourceNpc.id)
        .sort(
          (a, b) =>
            distance(sourceNpc.position, a.position) -
            distance(sourceNpc.position, b.position)
        )[0] ?? null;

    if (!targetNpc) continue;

    const latestRun = await getLatestHiveNpcAutonomousRun({
      npcIds: [sourceNpc.id, targetNpc.id],
      serverId: input.serverId,
    });

    if (
      latestRun &&
      Date.now() - new Date(latestRun.created_at).getTime() < cooldownMs
    ) {
      continue;
    }

    try {
      const result = await runHiveNpcInteraction({
        actorUserId: input.actorUserId,
        autonomous: true,
        creditSource: settings.defaultCreditSource ?? 'workspace',
        creditWsId: settings.defaultCreditWsId,
        expectedRevision: Number(state?.revision ?? 0),
        maxTurns,
        model: settings.defaultModel ?? sourceNpc.model,
        prompt:
          'Autonomously coordinate a small, observable next action for this Hive world.',
        promptMode: 'enhanced',
        researchSessionId: input.researchSessionId,
        sbAdmin: await createAdminClient({ noCookie: true }),
        serverId: input.serverId,
        sourceNpcId: sourceNpc.id,
        targetNpcId: targetNpc.id,
        trigger: 'simulation',
        world: asWorld(state?.world_data),
      });

      if (result.runs.length > 0) {
        interactions += 1;
        creditsSpent += result.runs.reduce(
          (sum, run) => sum + Number(run.credits_deducted ?? 0),
          0
        );
      }
    } catch (error) {
      console.warn('Hive autonomous NPC interaction skipped', {
        error: error instanceof Error ? error.message : String(error),
        serverId: input.serverId,
        sourceNpcId: sourceNpc.id,
        targetNpcId: targetNpc.id,
      });
    }
  }

  return interactions;
}

export async function runHiveSimulationTick(options?: {
  force?: boolean;
  researchSessionId?: string | null;
  serverId?: string;
}) {
  await ensureHiveResearchSchema();
  const sql = getHiveSql();
  const servers = options?.serverId
    ? await sql<
        Array<{
          created_by: string | null;
          id: string;
          settings: Record<string, unknown>;
        }>
      >`
        select id, settings, created_by
        from hive_servers
        where enabled = true and id = ${options.serverId}
      `
    : await sql<
        Array<{
          created_by: string | null;
          id: string;
          settings: Record<string, unknown>;
        }>
      >`
        select id, settings, created_by
        from hive_servers
        where enabled = true
          and coalesce((settings ->> 'simulationCronEnabled')::boolean, false) = true
      `;

  const results: Array<{
    actions: number;
    serverId: string;
    status: 'completed' | 'failed' | 'skipped';
  }> = [];

  for (const server of servers) {
    const researchSessionId = await resolveHiveResearchSessionId({
      researchSessionId: options?.researchSessionId,
      serverId: server.id,
    });
    const serverSettings = normalizeSettings(server.settings ?? {});
    const cronEnabled = serverSettings.simulationCronEnabled === true;
    if (!options?.force && !cronEnabled) {
      results.push({ actions: 0, serverId: server.id, status: 'skipped' });
      continue;
    }

    const [tick] = await sql<Array<{ id: string }>>`
      insert into hive_simulation_ticks (
        server_id, status, research_session_id
      )
      values (${server.id}, 'running', ${researchSessionId})
      returning id
    `;

    if (!tick) {
      results.push({ actions: 0, serverId: server.id, status: 'failed' });
      continue;
    }

    try {
      const crops = await sql<
        Array<{
          growth_stage: number;
          id: string;
          max_growth_stage: number;
          needs_water: boolean;
        }>
      >`
        update hive_crop_instances
        set growth_stage = least(max_growth_stage, growth_stage + case when needs_water then 0 else 1 end),
          needs_water = true,
          health = greatest(0, health - case when needs_water then 8 else 1 end),
          ready_at = case
            when growth_stage + 1 >= max_growth_stage and ready_at is null
            then now()
            else ready_at
          end
        where server_id = ${server.id} and harvested_at is null
        returning id, growth_stage, max_growth_stage, needs_water
      `;

      const needs = await sql<
        Array<{
          energy: number;
          hunger: number;
          morale: number;
          npc_id: string;
        }>
      >`
        update hive_npc_needs needs
        set hunger = greatest(0, hunger - 4),
          energy = greatest(0, energy - 3),
          morale = greatest(0, morale - 1),
          updated_at = now()
        from hive_npcs npc
        where npc.id = needs.npc_id
          and npc.server_id = ${server.id}
          and npc.status = 'active'
        returning needs.npc_id, needs.hunger, needs.energy, needs.morale
      `;

      const eliminated = await sql<Array<{ npc_id: string }>>`
        update hive_npcs npc
        set status = 'eliminated',
          eliminated_at = now(),
          updated_at = now()
        from hive_npc_wallets wallet
        where wallet.npc_id = npc.id
          and npc.server_id = ${server.id}
          and npc.status = 'active'
          and wallet.balance <= 0
        returning npc.id as npc_id
      `;

      const autonomousInteractions = await runAutonomousNpcInteractions({
        actorUserId: server.created_by,
        researchSessionId,
        serverId: server.id,
        settings: serverSettings,
      });
      const actions =
        crops.length +
        needs.length +
        eliminated.length +
        autonomousInteractions;
      await sql`
        update hive_simulation_ticks
        set status = 'completed',
          actions_count = ${actions},
          summary = ${sql.json(
            asHiveJson({
              cropsAdvanced: crops.length,
              autonomousInteractions,
              eliminatedNpcs: eliminated.length,
              needsUpdated: needs.length,
            })
          )},
          finished_at = now()
        where id = ${tick.id}
      `;
      results.push({ actions, serverId: server.id, status: 'completed' });
    } catch (error) {
      await sql`
        update hive_simulation_ticks
        set status = 'failed',
          error = ${error instanceof Error ? error.message : String(error)},
          finished_at = now()
        where id = ${tick.id}
      `;
      results.push({ actions: 0, serverId: server.id, status: 'failed' });
    }
  }

  return results;
}
