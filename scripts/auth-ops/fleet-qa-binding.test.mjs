import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  validateAck,
  secureBytes,
  EXEC_ACK,
  CLEAN_ACK,
  SCHEMA_SHA256,
  LOCAL_SHA256,
  createGuardedFetch,
} from './fleet-qa.mjs';
import { syntheticCopy } from './fleet-qa-test-copy.mjs';
const expected = {
  ackId: EXEC_ACK,
  helperSha256: 'a'.repeat(64),
  receiptSchemaSha256: SCHEMA_SHA256,
  projectRef: 'abcdefghijklmnopqrst',
  custodyDirectory: '/synthetic/custody',
  labels: ['a1', 'a2'],
};
function ack() {
  return {
    ...expected,
    moduleSha256: { 'fleet-qa-local.mjs': LOCAL_SHA256 },
    executor: 'Rex',
    expiresAt: '2026-11-17T23:59:00+07:00',
    oneUse: true,
    securityAck: true,
    reviewer: 'Security Desk (Selene, D269)',
  };
}
test('ACK requires exact source/module/schema/project/mode, expiry, executor and labels', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  assert.equal(typeof validateAck(ack(), expected, now), 'function');
  for (const change of [
    { ackId: CLEAN_ACK },
    { helperSha256: 'b'.repeat(64) },
    { receiptSchemaSha256: 'b'.repeat(64) },
    { moduleSha256: {} },
    { moduleSha256: { 'fleet-qa-local.mjs': 'b'.repeat(64) } },
    { projectRef: 'tsrqponmlkjihgfedcba' },
    { custodyDirectory: '/synthetic/other' },
    { executor: 'author' },
    { jwtExpirySeconds: 3600 },
    { oneUse: false },
    { securityAck: false },
    { reviewer: 'other' },
    { labels: ['a1'] },
    { labels: ['a1', 'a1'] },
    { labels: ['a1', 'fleet-qa'] },
    { expiresAt: '2020-01-01T00:00:00+07:00' },
    { expiresAt: '2099-11-17T23:59:00+07:00' },
    { expiresAt: '2026-11-17T16:59:00Z' },
    { secret: 'forbidden' },
  ])
    assert.throws(() => validateAck({ ...ack(), ...change }, expected, now));
});
test('expiry is rechecked at every provider call', () => {
  const original = Date.now;
  let current = Date.parse('2026-11-16T10:00:00Z');
  Date.now = () => current;
  try {
    const check = validateAck(ack(), expected);
    check();
    current = Date.parse(ack().expiresAt);
    assert.throws(check);
  } finally {
    Date.now = original;
  }
});
test('ACK file is executor-owned 0600 regular nlink1 with O_NOFOLLOW, closed on refusal', async () => {
  for (const change of [
    { uid: process.getuid() + 1 },
    { mode: 0o644 },
    { nlink: 2 },
    { isFile: () => false },
  ]) {
    let closed = false;
    let read = false;
    const opener = async (_path, flags) => {
      assert.ok(flags & constants.O_NOFOLLOW);
      return {
        stat: async () => ({
          uid: process.getuid(),
          mode: 0o600,
          nlink: 1,
          size: 1,
          isFile: () => true,
          ...change,
        }),
        readFile: async () => {
          read = true;
          return Buffer.from('x');
        },
        close: async () => {
          closed = true;
        },
      };
    };
    await assert.rejects(
      secureBytes('/synthetic', { custodyOnly: true, opener })
    );
    assert.equal(read, false);
    assert.equal(closed, true);
  }
});
test('real on-disk O_EXCL intent is separate from admission and cannot replay', async (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-11-16T10:00:00Z'),
  });
  const copy = await syntheticCopy();
  try {
    const module = await copy.import();
    await copy.writeAck(copy.ack());
    const gate = await module.admit('execution', copy.dir);
    const intent = join(copy.dir, `${EXEC_ACK}.intent`);
    await assert.rejects(stat(intent), { code: 'ENOENT' });
    await gate.consume();
    assert.equal((await stat(intent)).mode & 0o777, 0o600);
    await assert.rejects(gate.consume());
    const replay = await module.admit('execution', copy.dir);
    await assert.rejects(replay.consume(), { code: 'EEXIST' });
    await assert.rejects(module.admit('cleanup', copy.dir));
    await writeFile(join(copy.folder, 'fleet-qa-receipt.schema.json'), '{}');
    await assert.rejects(module.admit('execution', copy.dir), /REFUSED/);
  } finally {
    await copy.close();
  }
});
test('expired synthetic admission still refuses before consuming an intent', async (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-11-18T00:00:00Z'),
  });
  const copy = await syntheticCopy();
  try {
    const module = await copy.import();
    await copy.writeAck(copy.ack());
    await assert.rejects(module.admit('execution', copy.dir), /REFUSED/);
    await assert.rejects(stat(join(copy.dir, `${EXEC_ACK}.intent`)), {
      code: 'ENOENT',
    });
  } finally {
    await copy.close();
  }
});
test('null pins fail with zero process.env reads and zero SDK loads', async () => {
  const copy = await syntheticCopy({ nullPins: true });
  let sdkLoads = 0;
  let envReads = 0;
  const original = process.env;
  let hook;
  try {
    const module = await copy.import();
    assert.equal(module.PROJECT_REF, null);
    hook = registerHooks({
      resolve(specifier, context, next) {
        if (specifier.includes('@supabase/supabase-js')) {
          sdkLoads++;
          throw new Error('SDK_DETECTOR');
        }
        return next(specifier, context);
      },
    });
    assert.throws(
      () => createRequire(import.meta.url).resolve('@supabase/supabase-js'),
      /SDK_DETECTOR/
    );
    assert.equal(sdkLoads, 1);
    sdkLoads = 0;
    process.env = new Proxy(original, {
      get() {
        envReads++;
        throw new Error('ENV_READ');
      },
      has() {
        envReads++;
        throw new Error('ENV_READ');
      },
      ownKeys() {
        envReads++;
        throw new Error('ENV_READ');
      },
      getOwnPropertyDescriptor() {
        envReads++;
        throw new Error('ENV_READ');
      },
    });
    await assert.rejects(
      module.main([
        '--custody-directory',
        copy.dir,
        '/synthetic/unused-receipt',
        'execution',
      ]),
      /REFUSED/
    );
  } finally {
    process.env = original;
    hook?.deregister();
    await copy.close();
  }
  assert.equal(envReads, 0);
  assert.equal(sdkLoads, 0);
});
test('guarded fetch denies expired, foreign, userinfo, fragment and aborted calls before transport', async () => {
  let calls = 0;
  let valid = true;
  const abort = new AbortController();
  const origin = 'https://abcdefghijklmnopqrst.supabase.co';
  const transport = createGuardedFetch(
    origin,
    () => {
      if (!valid) throw new Error('EXPIRED');
    },
    abort.signal,
    async (url, options) => {
      calls++;
      assert.equal(url.origin, origin);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      return new Response('{}');
    }
  );
  for (const value of [
    'https://outside.invalid/',
    'https://user@abcdefghijklmnopqrst.supabase.co/',
    `${origin}/#fragment`,
  ])
    assert.throws(() => transport(value));
  assert.equal(calls, 0);
  await transport(`${origin}/auth/v1/admin/users`, { redirect: 'follow' });
  assert.equal(calls, 1);
  valid = false;
  assert.throws(() => transport(origin), /EXPIRED/);
  valid = true;
  abort.abort();
  assert.throws(() => transport(origin));
  assert.equal(calls, 1);
});
test('startup options and malformed/locked receipts cannot consume a phase intent', async () => {
  for (const setup of ['NODE_OPTIONS', 'execArgv', 'malformed', 'locked']) {
    const copy = await syntheticCopy();
    try {
      await copy.writeAck(copy.ack('D241Q-CLEANUP-01'));
      const receipt = join(copy.dir, 'receipt.json');
      await writeFile(receipt, '{}', { mode: 0o600 });
      if (setup === 'locked')
        await writeFile(`${receipt}.lock`, '', { mode: 0o600 });
      const env = setup === 'NODE_OPTIONS' ? { NODE_OPTIONS: '' } : {};
      const args = [
        ...(setup === 'execArgv' ? ['--no-warnings'] : []),
        copy.path,
        '--custody-directory',
        copy.dir,
        receipt,
        'cleanup',
      ];
      const result = spawnSync(process.execPath, args, {
        env,
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(result.status, 1, result.stderr);
      await assert.rejects(stat(join(copy.dir, `${CLEAN_ACK}.intent`)), {
        code: 'ENOENT',
      });
      if (setup !== 'locked')
        await assert.rejects(stat(`${receipt}.lock`), { code: 'ENOENT' });
      else assert.ok(await stat(`${receipt}.lock`));
    } finally {
      await copy.close();
    }
  }
});
