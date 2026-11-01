const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

async function ledgerFixture(t) {
  const { attemptLedger, signAttemptState } = await import(
    './wave1-native-attempt.mjs'
  );
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(
    'CREATE TABLE wave1_attempts (app TEXT PRIMARY KEY, record TEXT NOT NULL)'
  );
  const identity = {
    sha: 'a'.repeat(40),
    digest: 'b'.repeat(64),
    worker: 'private-staging',
    accountId: 'fixture-account',
    admission: { fixture: true },
  };
  const options = {
    base: 'https://fixture.invalid/accounts/fixture-account',
    token: 'staging-only-fixture',
    databaseId: '33333333-3333-3333-3333-333333333333',
    expectedDatabaseId: '33333333-3333-3333-3333-333333333333',
    repository: 'fixture/repo',
    app: 'mail',
    identity,
    runId: '123',
    runAttempt: '1',
  };
  const scope = {
    databaseId: options.databaseId,
    repository: options.repository,
    app: options.app,
    worker: identity.worker,
    accountId: identity.accountId,
  };
  const read = () =>
    JSON.parse(
      JSON.parse(db.prepare('SELECT record FROM wave1_attempts').get().record)
        .data
    );
  const seed = (data) =>
    db
      .prepare('INSERT OR REPLACE INTO wave1_attempts VALUES (?, ?)')
      .run('wave1-mail-staging', signAttemptState(data, options.token));
  seed({ schema: 1, scope, entries: [] });
  let queries = 0;
  options.request = async (url, token, { sql, params }) => {
    assert.equal(
      url,
      `${options.base}/d1/database/${options.databaseId}/query`
    );
    assert.equal(token, options.token);
    queries++;
    const stmt = db.prepare(sql);
    const result = sql.startsWith('SELECT')
      ? { results: stmt.all(...params) }
      : { meta: stmt.run(...params) };
    return { success: true, result: [{ success: true, ...result }] };
  };
  return {
    db,
    options,
    seed,
    read,
    open: () => attemptLedger(options),
    queries: () => queries,
  };
}
const rollback = {
  id: 'rollback',
  versions: [
    { version_id: '11111111-1111-1111-1111-111111111111', percentage: 100 },
  ],
};
test('D1 SQL CAS admits only one of two runners with the same authenticated preimage', async (t) => {
  const f = await ledgerFixture(t);
  const first = await f.open();
  const second = await f.open();
  await first.start(rollback);
  await assert.rejects(second.start(rollback), /changed or deleted/);
  assert.equal(f.read().entries.length, 1);
  assert.equal(f.read().entries[0].state, 'pending');
  assert.equal(f.queries(), 5);
});
test('D1 SQL deletion between read and consumption fails closed and never inserts', async (t) => {
  const f = await ledgerFixture(t);
  const ledger = await f.open();
  f.db.exec('DELETE FROM wave1_attempts');
  await assert.rejects(ledger.start(rollback), /changed or deleted/);
  await assert.rejects(f.open(), /Missing durable/);
  assert.equal(
    f.db.prepare('SELECT COUNT(*) AS count FROM wave1_attempts').get().count,
    0
  );
});
test('legitimate signed progress survives restart with original run, full identity and rollback', async (t) => {
  const f = await ledgerFixture(t);
  const ledger = await f.open();
  await ledger.start(rollback);
  const version = '22222222-2222-2222-2222-222222222222';
  await ledger.save('uploaded', version);
  f.options.runId = '456';
  const restarted = await f.open();
  assert.equal(restarted.prior.runId, '123');
  assert.deepEqual(restarted.prior.payload, {
    ...f.options.identity,
    rollback,
  });
  await restarted.save('activated', version);
  assert.equal(f.read().entries[0].state, 'activated');
  assert.equal(f.read().entries[0].versionId, version);
  await assert.rejects(restarted.start(rollback), /already consumed/);
});
test('authentic terminal history admits a different artifact without erasing consumption', async (t) => {
  const f = await ledgerFixture(t);
  const ledger = await f.open();
  await ledger.start(rollback);
  await ledger.save('failed');
  f.options.identity = {
    ...f.options.identity,
    sha: 'c'.repeat(40),
    digest: 'd'.repeat(64),
  };
  const next = await f.open();
  await next.start(rollback);
  assert.equal(f.read().entries.length, 2);
  assert.equal(f.read().entries[1].state, 'failed');
  assert.equal(f.read().entries[0].state, 'pending');
});
test('copied signed records cannot cross database, app, Worker, repository or account boundaries', async (t) => {
  for (const field of [
    'databaseId',
    'repository',
    'app',
    'worker',
    'accountId',
  ]) {
    const f = await ledgerFixture(t);
    const data = f.read();
    data.scope[field] = 'wrong-scope';
    f.seed(data);
    await assert.rejects(f.open(), /scope mismatch/);
  }
});
test('unresolved earlier operation blocks another artifact even with a fresh run ID', async (t) => {
  const f = await ledgerFixture(t);
  const ledger = await f.open();
  await ledger.start(rollback);
  f.options.identity = { ...f.options.identity, sha: 'c'.repeat(40) };
  f.options.runId = '456';
  await assert.rejects(f.open(), /Earlier publication attempt is unresolved/);
  assert.equal(f.read().entries.length, 1);
});
test('a D1 database other than the configured staging one is refused before any query', async (t) => {
  const { attemptLedger, readAttemptRecord } = await import(
    './wave1-native-attempt.mjs'
  );
  const f = await ledgerFixture(t);
  const other = '44444444-4444-4444-4444-444444444444';
  for (const patch of [
    { databaseId: other },
    { expectedDatabaseId: other },
    { expectedDatabaseId: undefined },
    { expectedDatabaseId: '' },
  ]) {
    await assert.rejects(attemptLedger({ ...f.options, ...patch }), /D1/);
    await assert.rejects(
      readAttemptRecord({
        request: async () => assert.fail('no query before the D1 guard'),
        base: f.options.base,
        token: f.options.token,
        app: f.options.app,
        scope: {},
        databaseId: patch.databaseId ?? f.options.databaseId,
        expectedDatabaseId:
          'expectedDatabaseId' in patch
            ? patch.expectedDatabaseId
            : f.options.expectedDatabaseId,
      }),
      /D1/
    );
  }
  assert.equal(f.queries(), 0);
});
