import { asHiveJson, getHiveSql } from './hive-db';

export async function runHiveSimulationTick(options?: {
  force?: boolean;
  serverId?: string;
}) {
  const sql = getHiveSql();
  const servers = options?.serverId
    ? await sql<
        Array<{
          id: string;
          settings: Record<string, unknown>;
        }>
      >`
        select id, settings
        from hive_servers
        where enabled = true and id = ${options.serverId}
      `
    : await sql<
        Array<{
          id: string;
          settings: Record<string, unknown>;
        }>
      >`
        select id, settings
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
    const cronEnabled = server.settings?.simulationCronEnabled === true;
    if (!options?.force && !cronEnabled) {
      results.push({ actions: 0, serverId: server.id, status: 'skipped' });
      continue;
    }

    const [tick] = await sql<Array<{ id: string }>>`
      insert into hive_simulation_ticks (server_id, status)
      values (${server.id}, 'running')
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

      const actions = crops.length + needs.length + eliminated.length;
      await sql`
        update hive_simulation_ticks
        set status = 'completed',
          actions_count = ${actions},
          summary = ${sql.json(
            asHiveJson({
              cropsAdvanced: crops.length,
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
