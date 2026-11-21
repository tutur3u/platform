import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createPsql,
  loadHistory,
  runMigration,
  validateMode,
} from './memory-db-production.mjs';

const directory = 'apps/supermemory/db';
const manifest = 'production-receipts.json';
const baselineFile = '001_schema.sql';
const migrationFile = '002_worker.sql';
const read = (file) =>
  readFileSync(new URL(`../../${directory}/${file}`, import.meta.url));
const { baseline, migration } = JSON.parse(read(manifest));
const source = 'a'.repeat(40);
const pinned = { source, baseline, migration, body: 'select 42;' };
const connection = {
  PGHOST: 'localhost',
  PGPORT: '55432',
  PGDATABASE: 'memory_worker_test',
};

function fixtureRepo(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'memory-db-source-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Migration fixture');
  git('config', 'user.email', 'migration-fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '/dev/null');
  mkdirSync(join(cwd, directory), { recursive: true });
  const write = (file, bytes) =>
    writeFileSync(join(cwd, directory, file), bytes);
  const commit = () => {
    git('add', '--all');
    git('commit', '--quiet', '--allow-empty', '-m', 'Fixture');
    return git('rev-parse', 'HEAD');
  };
  for (const file of [manifest, baselineFile, migrationFile])
    write(file, read(file));
  return { cwd, write, git, commit };
}

test('pinned ancestor SQL matches the trusted receipts even with a modified worktree', (t) => {
  const { cwd, write, commit } = fixtureRepo(t);
  const sha = commit();
  const trusted = commit();
  write(migrationFile, 'select 42;');
  const history = loadHistory({ cwd, source: sha, trusted });
  assert.equal(
    history.migration.sha256,
    '42bdd6f9c9499cf1e66b6c3238ccfa5090828dcceeae21acd0338849f06ff350'
  );
  assert.match(history.body, /^\ncreate schema memory_worker;/);
  assert.doesNotMatch(history.body, /\ncommit;$/);
  assert.throws(
    () => loadHistory({ cwd, source: sha, trusted: sha }),
    /Checkout does not match/
  );
});

test('digest mismatch, stale receipt, and non-ancestor pin fail closed', (t) => {
  const { cwd, write, commit, git } = fixtureRepo(t);
  const good = commit();
  write(migrationFile, 'begin;\nselect 42;\ncommit;\n');
  const changedSql = commit();
  assert.throws(
    () => loadHistory({ cwd, source: changedSql, trusted: changedSql }),
    /SQL digest mismatch/
  );
  write(manifest, JSON.stringify({ baseline, migration }));
  const changedReceipt = commit();
  assert.throws(
    () => loadHistory({ cwd, source: good, trusted: changedReceipt }),
    /different production receipt history/
  );
  git('checkout', '--detach', good);
  assert.throws(
    () => loadHistory({ cwd, source: changedSql, trusted: good }),
    /ancestry/
  );
});

const initial = {
  database: connection.PGDATABASE,
  oid: '12345',
  baseline: true,
  ledgerSchema: false,
  hasLedger: false,
  receipts: [],
  markers: { schema: false, caller: false, role: false },
};

function simulate(states) {
  const queries = [];
  return {
    queries,
    psql(step, sql) {
      queries.push(sql);
      if (step === 'atomic migration') return '';
      assert.match(sql, /^begin isolation level repeatable read read only;/);
      assert.doesNotMatch(sql, /create schema|insert into/i);
      assert.ok(states.length, 'Unexpected database query');
      return JSON.stringify(states.shift());
    },
  };
}

function run(mode, psql, expected, database = connection) {
  return runMigration({
    history: pinned,
    connection: database,
    mode,
    expected,
    psql,
  });
}

test('list only reads and binds the approval to exact source, target, and digest', () => {
  const { psql, queries } = simulate([initial, initial]);
  const listed = run('list_only', psql);
  assert.deepEqual(listed.pending, [migration]);
  assert.deepEqual(listed.applied, []);
  assert.match(listed.planSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(
    listed.planSha256,
    run('list_only', psql, '', { ...connection, PGHOST: 'other' }).planSha256
  );
  assert.equal(queries.length, 2);
  assert.throws(() => validateMode('apply', ''), /Apply requires/);
  assert.throws(
    () => validateMode('list_only', listed.planSha256),
    /Apply requires/
  );
  assert.throws(() => validateMode('unknown', ''), /Apply requires/);
});

test('apply rechecks under lock, records the receipt atomically, then reads it back', () => {
  const { planSha256 } = run('list_only', simulate([initial]).psql);
  const receipt = {
    version: migrationFile,
    sha256: migration.sha256,
    plan_sha256: planSha256,
    source_sha: source,
    applied_at: '2026-11-21T17:00:00+00:00',
  };
  const applied = {
    ...initial,
    ledgerSchema: true,
    hasLedger: true,
    receipts: [receipt],
    markers: { schema: true, caller: true, role: true },
  };
  const { psql, queries } = simulate([initial, applied, applied]);
  assert.deepEqual(run('apply', psql, planSha256), {
    mode: 'apply',
    outcome: 'applied',
    receipt,
  });
  assert.match(
    queries[1],
    /pg_advisory_xact_lock[\s\S]+as approved[\s\S]+select 42;[\s\S]+insert into memory_worker_migrations\.applied[\s\S]+commit;/
  );
  assert.deepEqual(run('apply', psql, planSha256), {
    mode: 'apply',
    outcome: 'already_applied',
    receipt,
  });
  assert.equal(queries.length, 4);
  const invalid = simulate([initial, initial]);
  assert.throws(
    () => run('apply', invalid.psql, 'f'.repeat(64)),
    /approved plan does not match/
  );
  assert.equal(invalid.queries.length, 1);
  const mismatched = {
    ...applied,
    receipts: [{ ...receipt, plan_sha256: 'b'.repeat(64) }],
  };
  assert.throws(
    () => run('apply', simulate([initial, mismatched]).psql, planSha256),
    /Post-commit migration readback/
  );
  const drifted = {
    ...applied,
    receipts: [{ ...receipt, sha256: 'c'.repeat(64) }],
  };
  assert.throws(
    () => run('list_only', simulate([drifted]).psql),
    /Migration history.*drift/
  );
});

test('unknown baseline, partial Worker objects and empty ledger refuse before writes', () => {
  for (const state of [
    { ...initial, baseline: false },
    { ...initial, database: 'different' },
    { ...initial, markers: { ...initial.markers, role: true } },
    { ...initial, ledgerSchema: true, hasLedger: true },
  ]) {
    const { queries, psql } = simulate([state]);
    assert.throws(
      () => run('list_only', psql),
      /baseline|Untracked Worker|Migration history/
    );
    assert.equal(queries.length, 1);
  }
});

test(
  'disposable pgvector applies and reads back one receipt with the legacy rows intact',
  {
    skip: !process.env.MEMORY_DB_FIXTURE_PORT,
  },
  (t) => {
    const fixture = {
      PGHOST: '127.0.0.1',
      PGPORT: process.env.MEMORY_DB_FIXTURE_PORT,
      PGDATABASE: 'memory_worker_test',
      PGUSER: 'memory_worker_test',
      PGPASSWORD: process.env.MEMORY_DB_FIXTURE_PASSWORD,
      PGSSLMODE: 'disable',
      PGCONNECT_TIMEOUT: '3',
    };
    assert.match(fixture.PGPORT, /^\d{4,5}$/);
    assert.ok(fixture.PGPASSWORD);
    const psql = createPsql(fixture);
    const { cwd, commit } = fixtureRepo(t);
    const sha = commit();
    const history = loadHistory({ cwd, source: sha, trusted: sha });
    const execute = (mode, expected, executeSql = psql) =>
      runMigration({
        history,
        connection: fixture,
        psql: executeSql,
        mode,
        expected,
      });

    psql('baseline fixture', read(baselineFile));
    psql(
      'seed fixture',
      `
    insert into public.memories (id, container_tag, custom_id, content, embedding)
    select 'legacy-' || n, 'legacy-tag', 'duplicate', 'legacy-content',
      array_fill(0.01::real, array[3072])::extensions.halfvec
    from generate_series(1, 2) n;
  `
    );
    const listed = execute('list_only');
    assert.deepEqual(listed.pending, [migration]);
    assert.equal(
      psql(
        'read-only assertion',
        "select to_regnamespace('memory_worker_migrations') is null;"
      ),
      't'
    );

    const changed = (step, sql) => {
      if (step === 'atomic migration') {
        psql('out-of-band schema fixture', 'create schema memory_worker;');
      }
      return psql(step, sql);
    };
    assert.throws(
      () => execute('apply', listed.planSha256, changed),
      /Postgres failed during atomic migration/
    );
    assert.equal(
      psql(
        'rollback assertion',
        "select to_regnamespace('memory_worker_migrations') is null;"
      ),
      't'
    );
    psql('clean drift fixture', 'drop schema memory_worker;');

    const failedWrite = (step, sql) =>
      psql(
        step,
        step === 'atomic migration'
          ? sql.replace(/commit;\s*$/, 'select 1 / 0;\ncommit;')
          : sql
      );
    assert.throws(
      () => execute('apply', listed.planSha256, failedWrite),
      /Postgres failed during atomic migration/
    );
    assert.deepEqual(execute('list_only'), listed);

    const applied = execute('apply', listed.planSha256);
    assert.equal(applied.outcome, 'applied');
    assert.equal(applied.receipt.source_sha, sha);
    assert.equal(applied.receipt.sha256, migration.sha256);
    assert.deepEqual(execute('list_only').applied, [applied.receipt]);
    assert.deepEqual(execute('apply', listed.planSha256), {
      ...applied,
      outcome: 'already_applied',
    });
    assert.equal(
      psql(
        'legacy assertion',
        `
    select count(*) from public.memories
    where custom_id = 'duplicate' and content = 'legacy-content'
      and worker_caller is null and worker_revision = 0;
  `
      ),
      '2'
    );
    assert.equal(
      psql(
        'stop assertion',
        `
    select count(*) from memory_worker.admission where stopped and remaining = 0 and epoch = 0;
  `
      ),
      '2'
    );
  }
);
