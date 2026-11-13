import type { Sql, TransactionSql } from 'postgres';
import type { WebAccountDevice } from './types';

interface VersionRow {
  device_version: string;
  session_version: string;
}

export class StaleAccountSwitchError extends Error {
  constructor() {
    super('Account switch state changed');
  }
}

/** MVCC tokens fence one in-flight switch; they are not durable operation IDs. */
export async function withAccountSwitchTransaction<T>(
  sql: Sql,
  device: WebAccountDevice,
  secretHash: string,
  accountId: string,
  effect: (transaction: TransactionSql) => Promise<T>
): Promise<T> {
  const [captured] = await sql<VersionRow[]>`
    select d.xmin::text || ':' || d.ctid::text as device_version,
      s.xmin::text || ':' || s.ctid::text as session_version
    from private.web_account_devices d
    join private.web_account_sessions s on s.device_id = d.id
    where d.id::text = ${device.deviceId} and s.user_id::text = ${accountId}
      and d.secret_hash = ${secretHash} and d.revoked_at is null
  `;
  if (!captured) throw new StaleAccountSwitchError();

  const result = await sql.begin(async (transaction) => {
    await transaction`set local lock_timeout = '3s'`;
    await transaction`set local statement_timeout = '10s'`;
    await transaction`set local idle_in_transaction_session_timeout = '15s'`;
    const [lockedDevice] = await transaction<{ device_version: string }[]>`
      select xmin::text || ':' || ctid::text as device_version
      from private.web_account_devices
      where id::text = ${device.deviceId}
        and secret_hash = ${secretHash} and revoked_at is null
      for update
    `;
    if (
      !lockedDevice ||
      lockedDevice.device_version !== captured.device_version
    ) {
      throw new StaleAccountSwitchError();
    }
    const [lockedSession] = await transaction<{ session_version: string }[]>`
      select xmin::text || ':' || ctid::text as session_version
      from private.web_account_sessions
      where device_id::text = ${device.deviceId} and user_id::text = ${accountId}
      for update
    `;
    if (
      !lockedSession ||
      lockedSession.session_version !== captured.session_version
    ) {
      throw new StaleAccountSwitchError();
    }
    return { value: await effect(transaction) };
  });
  return result.value;
}
