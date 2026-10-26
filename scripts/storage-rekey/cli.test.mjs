import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCli } from './cli.mjs';
import { ROOTS } from './roots.mjs';
import { lit } from './supabase.mjs';

const base = [
  '--project-ref',
  'abcdefghijklmnopqrst',
  '--environment',
  'production',
  '--ledger',
  '/tmp/l.json',
];

test('dry run is the default mode', () => {
  assert.equal(parseCli([...base, '--root', 'chats']).mode, 'dry-run');
});

test('execute needs a root and a one-time approval token', () => {
  assert.throws(
    () => parseCli([...base, '--execute', '--approve-token-file', '/tmp/t']),
    /--root is required/
  );
  assert.throws(
    () => parseCli([...base, '--execute', '--root', 'chats']),
    /--approve-token-file/
  );
  assert.equal(
    parseCli([
      ...base,
      '--execute',
      '--root',
      'chats',
      '--approve-token-file',
      '/tmp/t',
    ]).mode,
    'execute'
  );
  assert.throws(() =>
    parseCli([
      ...base,
      '--dry-run',
      '--execute',
      '--root',
      'chats',
      '--approve-token-file',
      '/tmp/t',
    ])
  );
});

test('the approval token is never accepted on argv', () => {
  assert.throws(
    () =>
      parseCli([
        ...base,
        '--execute',
        '--root',
        'chats',
        '--approve-token',
        't',
      ]),
    { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' }
  );
  assert.throws(
    () => parseCli([...base, '--rollback', '--root', 'chats']),
    /--approve-token-file/
  );
  assert.throws(
    () => parseCli([...base, '--root', 'chats', '--retry-failed']),
    /only valid with --execute/
  );
  assert.equal(
    parseCli([
      ...base,
      '--execute',
      '--root',
      'chats',
      '--approve-token-file',
      '/tmp/t',
      '--retry-failed',
    ]).retryFailed,
    true
  );
});

test('bounds: batch <= 50, max-ops capped, probes staging-only', () => {
  assert.throws(
    () => parseCli([...base, '--root', 'chats', '--batch-size', '51']),
    /batch-size/
  );
  assert.throws(
    () => parseCli([...base, '--root', 'chats', '--max-ops', '0']),
    /max-ops/
  );
  assert.throws(
    () => parseCli([...base, '--root', 'chats', '--probe-every', '1']),
    /staging/
  );
  const staging = base.map((v) => (v === 'production' ? 'staging' : v));
  assert.equal(
    parseCli([...staging, '--root', 'chats', '--probe-every', '1']).probeEvery,
    1
  );
});

test('.tuturuuu execution requires the reference confirmation flag', () => {
  const args = [
    ...base,
    '--execute',
    '--root',
    '.tuturuuu',
    '--approve-token-file',
    '/tmp/t',
  ];
  assert.throws(() => parseCli(args), /references-confirmed/);
  assert.equal(parseCli([...args, '--references-confirmed']).root, '.tuturuuu');
});

test('literals are quoted safely', () => {
  assert.equal(lit("a'b"), "'a''b'");
  assert.equal(lit(null), 'null');
  assert.throws(() => lit('a\u0000'));
});

test('refs SQL: CAS and owner restore only on the forward path; OR clauses are grouped', () => {
  const entry = {
    id: 'id-1',
    wsId: 'ws',
    oldUpdatedAt: '2026-01-01 00:00:00+00',
  };
  const forward = ROOTS.chats.refsUpdateSql({
    bucket: 'workspaces',
    entry,
    from: 'ws/chats/c/a',
    to: 'ws/chats/c/n-a',
    guard: true,
  });
  assert.match(
    forward,
    /o\.updated_at = '2026-01-01 00:00:00\+00'::timestamptz/
  );
  assert.match(forward, /for update/);
  assert.match(forward, /owner = g\.owner/);
  assert.match(forward, /where \(a\.full_path = 'ws\/chats\/c\/a'/);
  assert.match(forward, /chat_id = |where true and/);
  const back = ROOTS.chats.refsUpdateSql({
    bucket: 'workspaces',
    entry,
    from: 'ws/chats/c/n-a',
    to: 'ws/chats/c/a',
    guard: false,
  });
  assert.doesNotMatch(back, /updated_at =/);
  assert.doesNotMatch(back, /owner = g\.owner/);
  for (const sql of [forward, back])
    assert.equal(
      sql.trim().startsWith('with '),
      true,
      'one statement, one transaction'
    );
});

test('selection is metadata-only and covers every root', () => {
  for (const root of Object.values(ROOTS)) {
    const sql = root.selectionSql({ bucket: 'workspaces' });
    assert.match(sql, /from storage\.objects/);
    assert.doesNotMatch(sql, /\b(insert|update|delete)\b/i);
  }
});
