import postgres from 'postgres';
import type { Caller, Command, StoreResponse } from './protocol';
import { execute } from './storage';

export type MemoryDatabase = postgres.TransactionSql;
type Gate = { epoch: string; revision: string };
const MAX_SQL_TIME_MS = 1000;
const MAX_LOCK_TIME_MS = 300;

async function setQueryLimits(sql: MemoryDatabase) {
  await sql`
    select set_config('statement_timeout', ${String(MAX_SQL_TIME_MS)}, true),
      set_config('lock_timeout', ${String(MAX_LOCK_TIME_MS)}, true)
  `;
}

export function openMemoryDatabase(
  connectionString: string,
  debug?: postgres.Options<Record<string, never>>['debug']
) {
  return postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 2,
    debug,
  });
}

const stopped = { status: 503, body: { error: 'memory_stopped' } };

export async function runMemoryCommand(
  database: postgres.Sql,
  caller: Caller,
  command: Command
): Promise<StoreResponse> {
  try {
    // Commit admission separately so a failed data transaction still consumes
    // its reservation. The second lock checks that no stop/reopen crossed it.
    const reservation = await database.begin(async (sql) => {
      await setQueryLimits(sql);
      const [gate] = await sql<Gate[]>`
        update memory_worker.admission
        set remaining = remaining - 1
        where caller = ${caller} and not stopped and remaining > 0
        returning epoch::text
      `;
      return gate;
    });
    if (!reservation) return stopped;

    return await database.begin(async (sql) => {
      await setQueryLimits(sql);
      const [gate] = await sql<Gate[]>`
        select epoch::text, revision::text
        from memory_worker.admission
        where caller = ${caller} and not stopped and epoch = ${reservation.epoch}::bigint
        for update
      `;
      if (!gate) return stopped;
      return execute(sql, caller, gate.revision, command);
    });
  } finally {
    await database.end({ timeout: 1 });
  }
}
