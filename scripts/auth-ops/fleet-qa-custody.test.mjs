import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { syntheticCopy } from './fleet-qa-test-copy.mjs';
import {
  parseArgs,
  validateAck,
  EXEC_ACK,
  LOCAL_SHA256,
  SCHEMA_SHA256,
} from './fleet-qa.mjs';
const custody = '/synthetic/executor-custody';
test('custody is explicit canonical argv input, never inferred from a receipt', () => {
  assert.deepEqual(
    parseArgs([
      '--custody-directory',
      custody,
      `${custody}/receipt.json`,
      'execution',
    ]),
    {
      custody,
      receipt: `${custody}/receipt.json`,
      command: 'execution',
      rest: [],
    }
  );
  for (const path of [
    null,
    '',
    '/',
    'relative',
    '/synthetic/../executor',
    `${custody}/`,
    `${custody}\0`,
  ])
    assert.throws(() =>
      parseArgs([
        '--custody-directory',
        path,
        `${custody}/receipt.json`,
        'execution',
      ])
    );
  assert.throws(() => parseArgs([`${custody}/receipt.json`, 'execution']));
});
test('external execution ACK binds the supplied custody directory exactly', () => {
  const expected = {
    ackId: EXEC_ACK,
    helperSha256: 'a'.repeat(64),
    receiptSchemaSha256: SCHEMA_SHA256,
    projectRef: 'abcdefghijklmnopqrst',
    labels: ['a1', 'a2'],
    custodyDirectory: custody,
  };
  const ack = {
    ...expected,
    moduleSha256: { 'fleet-qa-local.mjs': LOCAL_SHA256 },
    executor: 'Rex',
    expiresAt: '2026-11-17T23:59:00+07:00',
    oneUse: true,
    securityAck: true,
    reviewer: 'Security Desk (Selene, D269)',
  };
  const now = Date.parse('2026-11-16T10:00:00Z');
  assert.equal(typeof validateAck(ack, expected, now), 'function');
  assert.throws(() =>
    validateAck({ ...ack, custodyDirectory: '/synthetic/other' }, expected, now)
  );
  const { custodyDirectory: ignored, ...missing } = ack;
  assert.throws(() => validateAck(missing, expected, now));
});
test('public helper source contains no home-directory custody default', async () => {
  for (const name of ['fleet-qa.mjs', 'fleet-qa-local.mjs'])
    assert.equal(
      (await readFile(new URL(name, import.meta.url), 'utf8')).includes(
        '/Users/'
      ),
      false
    );
});

test('a custody argument outside the private copy stops before environment access', async () => {
  const copy = await syntheticCopy();
  const env = process.env;
  let reads = 0;
  let refused = false;
  try {
    const helper = await copy.import();
    process.env = new Proxy(env, {
      get() {
        reads++;
        throw new Error('ENV_READ');
      },
      getOwnPropertyDescriptor() {
        reads++;
        throw new Error('ENV_READ');
      },
    });
    try {
      await helper.main([
        '--custody-directory',
        `${copy.dir}/other`,
        `${copy.dir}/other/receipt.json`,
        'execution',
      ]);
    } catch (error) {
      refused = error.message === 'REFUSED';
    }
  } finally {
    process.env = env;
    await copy.close();
  }
  assert.equal(refused, true);
  assert.equal(reads, 0);
});
