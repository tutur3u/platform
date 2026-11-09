import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  StaleAccountSwitchError,
  withAccountSwitchTransaction,
} from './switch-transaction';

const fixtureUrl = process.env.GAP01_TEST_DATABASE_URL;
const device = {
  deviceId: '10000000-0000-0000-0000-000000000001',
  secret: 'synthetic',
  activeUserId: null,
};
const accountId = '20000000-0000-0000-0000-000000000001';

describe.skipIf(!fixtureUrl)('isolated PG account switch locking', () => {
  let onLockAttempt = () => {};
  const sql = postgres(fixtureUrl ?? 'postgres://invalid', {
    max: 5,
    prepare: false,
    onnotice: () => {},
    debug: (_connection, query) => {
      if (/for update\s*$/.test(query.trim())) onLockAttempt();
    },
  });

  beforeAll(async () => {
    const url = new URL(fixtureUrl ?? '');
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/gap01_fixture' ||
      url.username !== 'gap01_fixture'
    ) {
      throw new Error(
        'Requires the disposable loopback gap01_fixture database and role'
      );
    }
    await sql`create schema if not exists private`;
    await sql`create table if not exists private.web_account_devices (
      id uuid primary key, secret_hash text not null, revoked_at timestamptz, active_user_id uuid
    )`;
    await sql`create table if not exists private.web_account_sessions (
      device_id uuid references private.web_account_devices(id) on delete cascade,
      user_id uuid, session_ciphertext text, primary key (device_id, user_id)
    )`;
  });
  beforeEach(async () => {
    onLockAttempt = () => {};
    await sql`delete from private.web_account_devices`;
    await sql`insert into private.web_account_devices (id, secret_hash) values (${device.deviceId}, 'verified')`;
    await sql`insert into private.web_account_sessions values (${device.deviceId}, ${accountId}, 'synthetic')`;
  });
  afterAll(async () => {
    await sql.end({ timeout: 1 });
  });

  it('holds the device lock through the effect and rejects the waiting captured version', async () => {
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release = () => {};
    const finish = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withAccountSwitchTransaction(
      sql,
      device,
      'verified',
      accountId,
      async (tx) => {
        entered();
        await finish;
        await tx`update private.web_account_devices set active_user_id = ${accountId} where id = ${device.deviceId}`;
        return 'committed';
      }
    );
    await started;
    onLockAttempt = release;
    let effects = 0;
    const second = withAccountSwitchTransaction(
      sql,
      device,
      'verified',
      accountId,
      async () => {
        effects++;
        return 'stale';
      }
    );
    await expect(second).rejects.toBeInstanceOf(StaleAccountSwitchError);
    expect(await first).toBe('committed');
    expect(effects).toBe(0);
  });

  it('rejects a target session rewritten after capture', async () => {
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release = () => {};
    const finish = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = sql.begin(async (tx) => {
      await tx`select id from private.web_account_devices for update`;
      entered();
      await finish;
    });
    await started;
    onLockAttempt = () => {
      onLockAttempt = () => {};
      void sql`update private.web_account_sessions set session_ciphertext = 'new-version'`.then(
        release
      );
    };
    let effects = 0;
    await expect(
      withAccountSwitchTransaction(
        sql,
        device,
        'verified',
        accountId,
        async () => {
          effects++;
          return 'unexpected';
        }
      )
    ).rejects.toBeInstanceOf(StaleAccountSwitchError);
    await blocker;
    expect(effects).toBe(0);
  });

  it('rejects invalid credentials before calling the provider effect', async () => {
    let effects = 0;
    await expect(
      withAccountSwitchTransaction(
        sql,
        device,
        'wrong',
        accountId,
        async () => {
          effects++;
        }
      )
    ).rejects.toBeInstanceOf(StaleAccountSwitchError);
    expect(effects).toBe(0);
  });

  it('rolls back database effects on failure', async () => {
    await expect(
      withAccountSwitchTransaction(
        sql,
        device,
        'verified',
        accountId,
        async (tx) => {
          await tx`update private.web_account_sessions set session_ciphertext = 'replaced'`;
          throw new Error('synthetic failure');
        }
      )
    ).rejects.toThrow('synthetic failure');
    const [row] =
      await sql`select session_ciphertext from private.web_account_sessions`;
    expect(row?.session_ciphertext).toBe('synthetic');
  });
});
