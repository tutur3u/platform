import {
  encodeHiveWorldUpdate,
  type HiveRealtimeWorld,
  mergeHiveCrdtUpdate,
} from '@tuturuuu/realtime/hive';
import postgres, { type Sql } from 'postgres';

type HiveWorldEventRow = {
  actor_user_id: string | null;
  created_at: string;
  event_type: string;
  id: string;
  payload: Record<string, unknown>;
  revision: string | number;
  server_id: string;
};

type HiveWorldStateRow = {
  crdt_state: Buffer | null;
  crdt_state_vector: Buffer | null;
  op_seq: string | number;
  world_data: HiveRealtimeWorld | null;
};

let sqlClient: Sql | null = null;
type PostgresJson = Parameters<Sql['json']>[0];

export function getHiveSql() {
  const databaseUrl = process.env.HIVE_DATABASE_URL;

  if (!databaseUrl) return null;

  sqlClient ??= postgres(databaseUrl, {
    idle_timeout: 20,
    max: 6,
    prepare: false,
  });

  return sqlClient;
}

function defaultWorld(): HiveRealtimeWorld {
  return { blocks: [], objects: [] };
}

function asJson(value: unknown): PostgresJson {
  return value as PostgresJson;
}

export function mapHiveWorldEvent(row: HiveWorldEventRow) {
  return {
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    payload: row.payload ?? {},
    revision: Number(row.revision ?? 0),
    serverId: row.server_id,
  };
}

export async function loadHiveCrdtSnapshot(serverId: string) {
  const sql = getHiveSql();
  if (!sql) return null;

  const [state] = await sql<HiveWorldStateRow[]>`
    select op_seq, world_data, crdt_state, crdt_state_vector
    from hive_world_states
    where server_id = ${serverId}
    limit 1
  `;

  return state ?? null;
}

export async function persistHiveWorldEvent(input: {
  actorUserId: string;
  eventType: string;
  payload: Record<string, unknown>;
  serverId: string;
  world: HiveRealtimeWorld;
}) {
  const sql = getHiveSql();
  if (!sql) return null;

  return sql.begin(async (tx) => {
    const [state] = await tx<HiveWorldStateRow[]>`
      insert into hive_world_states (server_id, world_data)
      values (${input.serverId}, ${tx.json(asJson(defaultWorld()))})
      on conflict (server_id) do update set updated_at = hive_world_states.updated_at
      returning op_seq
    `;
    const nextSeq = Number(state?.op_seq ?? 0) + 1;
    const crdt = encodeHiveWorldUpdate(input.world);

    await tx`
      update hive_world_states
      set op_seq = ${nextSeq},
        world_data = ${tx.json(asJson(input.world))},
        crdt_state = ${Buffer.from(crdt.state)},
        crdt_state_vector = ${Buffer.from(crdt.stateVector)},
        updated_by = ${input.actorUserId},
        updated_at = now()
      where server_id = ${input.serverId}
    `;

    const [event] = await tx<HiveWorldEventRow[]>`
      insert into hive_world_events (
        server_id, actor_user_id, op_seq, event_type, payload
      )
      values (
        ${input.serverId},
        ${input.actorUserId},
        ${nextSeq},
        ${input.eventType},
        ${tx.json(asJson(input.payload))}
      )
      returning id, server_id, actor_user_id, revision, event_type, payload, created_at
    `;

    return event ? mapHiveWorldEvent(event) : null;
  });
}

export async function persistHiveCrdtUpdate(input: {
  actorUserId: string;
  serverId: string;
  update: Uint8Array;
  world?: HiveRealtimeWorld;
}) {
  const sql = getHiveSql();
  if (!sql) return null;

  return sql.begin(async (tx) => {
    const [state] = await tx<HiveWorldStateRow[]>`
      insert into hive_world_states (server_id, world_data)
      values (${input.serverId}, ${tx.json(asJson(defaultWorld()))})
      on conflict (server_id) do update set updated_at = hive_world_states.updated_at
      returning op_seq, world_data, crdt_state, crdt_state_vector
    `;
    const merged = mergeHiveCrdtUpdate({
      currentState: state?.crdt_state ? new Uint8Array(state.crdt_state) : null,
      fallbackWorld: input.world ?? state?.world_data ?? null,
      update: input.update,
    });
    const nextSeq = Number(state?.op_seq ?? 0) + 1;

    await tx`
      update hive_world_states
      set op_seq = ${nextSeq},
        crdt_state = ${Buffer.from(merged.state)},
        crdt_state_vector = ${Buffer.from(merged.stateVector)},
        world_data = ${tx.json(asJson(merged.world))},
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
        ${Buffer.from(input.update)},
        ${Buffer.from(merged.stateVector)},
        ${input.update.byteLength}
      )
    `;

    return {
      opSeq: nextSeq,
      state: merged.state,
      stateVector: merged.stateVector,
      world: merged.world,
    };
  });
}
