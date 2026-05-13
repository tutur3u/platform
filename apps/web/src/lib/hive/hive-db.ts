import postgres, { type Sql } from 'postgres';
import 'server-only';
import type { Json } from '@tuturuuu/types/db';
import type {
  HiveMemberRow,
  HiveNpcRow,
  HiveServerRow,
  HiveWorld,
  HiveWorldEventRow,
  HiveWorldStateRow,
} from './types';

const DEFAULT_WORLD: HiveWorld = { blocks: [], objects: [] };

let hiveSql: Sql | null = null;
type PostgresJson = Parameters<Sql['json']>[0];

export function asHiveJson(value: unknown): PostgresJson {
  return value as PostgresJson;
}

export function getHiveSql() {
  const url = process.env.HIVE_DATABASE_URL;

  if (!url) {
    throw new Error('HIVE_DATABASE_URL is required for Hive product data');
  }

  hiveSql ??= postgres(url, {
    idle_timeout: 20,
    max: 6,
    prepare: false,
  });

  return hiveSql;
}

export function toBase64(value: Buffer | Uint8Array | null | undefined) {
  if (!value) return null;
  return Buffer.from(value).toString('base64');
}

export function fromBase64(value: string) {
  return Buffer.from(value, 'base64');
}

export function normalizeWorld(value: Json | null | undefined): HiveWorld {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_WORLD;
  }

  const world = value as Partial<HiveWorld>;
  return {
    blocks: Array.isArray(world.blocks) ? world.blocks : [],
    objects: Array.isArray(world.objects) ? world.objects : [],
  };
}

export async function getHiveMemberByUserId(userId: string) {
  const sql = getHiveSql();
  const [member] = await sql<HiveMemberRow[]>`
    select id, user_id, enabled, notes, created_at
    from hive_members
    where user_id = ${userId}
    limit 1
  `;
  return member ?? null;
}

export async function listHiveMembers() {
  const sql = getHiveSql();
  return sql<HiveMemberRow[]>`
    select id, user_id, enabled, notes, created_at
    from hive_members
    order by created_at desc
  `;
}

export async function upsertHiveMember(input: {
  enabled: boolean;
  notes: string | null;
  userId: string;
}) {
  const sql = getHiveSql();
  const [member] = await sql<HiveMemberRow[]>`
    insert into hive_members (user_id, enabled, notes, updated_at)
    values (${input.userId}, ${input.enabled}, ${input.notes}, now())
    on conflict (user_id) do update set
      enabled = excluded.enabled,
      notes = excluded.notes,
      updated_at = now()
    returning id, user_id, enabled, notes, created_at
  `;
  return member ?? null;
}

export async function listHiveServers(isAdmin: boolean) {
  const sql = getHiveSql();
  return isAdmin
    ? sql<HiveServerRow[]>`
        select id, name, slug, description, enabled, max_players, total_currency,
          settings, ollama_state, created_at
        from hive_servers
        order by created_at asc
      `
    : sql<HiveServerRow[]>`
        select id, name, slug, description, enabled, max_players, total_currency,
          settings, ollama_state, created_at
        from hive_servers
        where enabled = true
        order by created_at asc
      `;
}

export async function getHiveServer(serverId: string) {
  const sql = getHiveSql();
  const [server] = await sql<HiveServerRow[]>`
    select id, name, slug, description, enabled, max_players, total_currency,
      settings, ollama_state, created_at
    from hive_servers
    where id = ${serverId}
    limit 1
  `;
  return server ?? null;
}

export async function createHiveServer(input: {
  createdBy: string;
  description: string | null;
  enabled: boolean;
  maxPlayers: number;
  name: string;
  slug: string;
}) {
  const sql = getHiveSql();
  return sql.begin(async (tx) => {
    const [server] = await tx<HiveServerRow[]>`
      insert into hive_servers (
        name, slug, description, enabled, max_players, created_by
      )
      values (
        ${input.name},
        ${input.slug},
        ${input.description},
        ${input.enabled},
        ${input.maxPlayers},
        ${input.createdBy}
      )
      returning id, name, slug, description, enabled, max_players,
        total_currency, settings, ollama_state, created_at
    `;

    if (!server) return null;

    await tx`
      insert into hive_world_states (server_id, world_data)
      values (${server.id}, ${tx.json(asHiveJson(DEFAULT_WORLD))})
      on conflict (server_id) do nothing
    `;

    return server;
  });
}

export async function updateHiveServer(
  serverId: string,
  input: {
    description?: string | null;
    enabled?: boolean;
    maxPlayers?: number;
    name?: string;
    settings?: Record<string, unknown>;
  }
) {
  const sql = getHiveSql();
  const [server] = await sql<HiveServerRow[]>`
    update hive_servers set
      description = coalesce(${input.description ?? null}, description),
      enabled = coalesce(${input.enabled ?? null}, enabled),
      max_players = coalesce(${input.maxPlayers ?? null}, max_players),
      name = coalesce(${input.name ?? null}, name),
      settings = case
        when ${!!input.settings}
        then settings || ${sql.json(asHiveJson(input.settings ?? {}))}::jsonb
        else settings
      end,
      updated_at = now()
    where id = ${serverId}
    returning id, name, slug, description, enabled, max_players, total_currency,
      settings, ollama_state, created_at
  `;
  return server ?? null;
}

export async function updateHiveOllamaState(
  serverId: string,
  state: Record<string, unknown>
) {
  const sql = getHiveSql();
  const [server] = await sql<HiveServerRow[]>`
    update hive_servers
    set ollama_state = ollama_state || ${sql.json(asHiveJson(state))}::jsonb,
      updated_at = now()
    where id = ${serverId}
    returning id, name, slug, description, enabled, max_players, total_currency,
      settings, ollama_state, created_at
  `;
  return server ?? null;
}

export async function deleteHiveServer(serverId: string) {
  const sql = getHiveSql();
  await sql`delete from hive_servers where id = ${serverId}`;
}

export async function getHiveSnapshot(serverId: string) {
  const sql = getHiveSql();
  const [[server], [state], events, npcs, warehouses, crops, inventories] =
    await Promise.all([
      sql<HiveServerRow[]>`
        select id, name, slug, description, enabled, max_players,
          total_currency, settings, ollama_state, created_at
        from hive_servers
        where id = ${serverId}
        limit 1
      `,
      sql<HiveWorldStateRow[]>`
        select op_seq, revision, world_data, crdt_state, crdt_state_vector
        from hive_world_states
        where server_id = ${serverId}
        limit 1
      `,
      sql<HiveWorldEventRow[]>`
        select id, server_id, actor_user_id, op_seq, revision, event_type,
          payload, created_at
        from hive_world_events
        where server_id = ${serverId}
        order by op_seq desc
        limit 100
      `,
      sql<HiveNpcRow[]>`
        select id, server_id, name, role, model, backstory, system_prompt,
          memory_enabled, backstory_enabled, custom_prompt_enabled, position,
          settings, status, created_at
        from hive_npcs
        where server_id = ${serverId}
        order by created_at asc
      `,
      sql`
        select id, name, position, capacity
        from hive_warehouses
        where server_id = ${serverId}
        order by created_at asc
      `,
      sql`
        select id, crop_type, position, growth_stage, max_growth_stage,
          needs_water, health, watered_at, ready_at, harvested_at
        from hive_crop_instances
        where server_id = ${serverId} and harvested_at is null
        order by planted_at asc
      `,
      sql`
        select owner_type, owner_id, item_type, quantity
        from hive_inventory_items
        where server_id = ${serverId}
        order by owner_type, item_type
      `,
    ]);

  return {
    crops,
    events: events.reverse(),
    inventories,
    npcs,
    server: server ?? null,
    state: state ?? null,
    warehouses,
  };
}

export async function createHiveWorldEvent(input: {
  actorUserId: string;
  eventType: string;
  payload: Record<string, unknown>;
  serverId: string;
  world: HiveWorld;
}) {
  const sql = getHiveSql();
  return sql.begin(async (tx) => {
    const [state] = await tx<HiveWorldStateRow[]>`
      insert into hive_world_states (server_id, world_data)
      values (${input.serverId}, ${tx.json(asHiveJson(DEFAULT_WORLD))})
      on conflict (server_id) do update set updated_at = hive_world_states.updated_at
      returning op_seq, revision, world_data, crdt_state, crdt_state_vector
    `;
    const nextSeq = Number(state?.op_seq ?? 0) + 1;

    await tx`
      update hive_world_states
      set op_seq = ${nextSeq},
        world_data = ${tx.json(asHiveJson(input.world))},
        updated_by = ${input.actorUserId},
        updated_at = now()
      where server_id = ${input.serverId}
    `;

    const [event] = await tx<HiveWorldEventRow[]>`
      insert into hive_world_events (
        server_id, actor_user_id, op_seq, event_type, payload, world_data
      )
      values (
        ${input.serverId},
        ${input.actorUserId},
        ${nextSeq},
        ${input.eventType},
        ${tx.json(asHiveJson(input.payload))},
        ${tx.json(asHiveJson(input.world))}
      )
      returning id, server_id, actor_user_id, op_seq, revision, event_type,
        payload, created_at
    `;

    return event ?? null;
  });
}

export async function persistHiveCrdtUpdate(input: {
  actorUserId: string | null;
  serverId: string;
  state: Buffer;
  stateVector: Buffer;
  update: Buffer;
  world?: HiveWorld | null;
}) {
  const sql = getHiveSql();
  return sql.begin(async (tx) => {
    const [state] = await tx<HiveWorldStateRow[]>`
      insert into hive_world_states (server_id, world_data)
      values (${input.serverId}, ${tx.json(asHiveJson(DEFAULT_WORLD))})
      on conflict (server_id) do update set updated_at = hive_world_states.updated_at
      returning op_seq
    `;
    const nextSeq = Number(state?.op_seq ?? 0) + 1;

    await tx`
      update hive_world_states
      set op_seq = ${nextSeq},
        crdt_state = ${input.state},
        crdt_state_vector = ${input.stateVector},
        world_data = coalesce(${input.world ? tx.json(asHiveJson(input.world)) : null}, world_data),
        updated_by = ${input.actorUserId},
        updated_at = now()
      where server_id = ${input.serverId}
    `;

    await tx`
      insert into hive_crdt_updates (
        server_id, actor_user_id, op_seq, update_data, state_vector, update_size
      )
      values (
        ${input.serverId},
        ${input.actorUserId},
        ${nextSeq},
        ${input.update},
        ${input.stateVector},
        ${input.update.byteLength}
      )
    `;

    return nextSeq;
  });
}
