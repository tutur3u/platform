import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertionFailureControl,
  skippedRestoreControl,
  validateExpectedFailure,
  validateFixtureTranscript,
  verifyHiddenWorkspaces,
} from './verify-hidden-workspaces.js';

const privacySql = readFileSync(
  new URL('../verification/hidden-workspaces-privacy.sql', import.meta.url),
  'utf8'
);
const guestSql = readFileSync(
  new URL(
    '../verification/hidden-workspaces-board-guests.sql',
    import.meta.url
  ),
  'utf8'
);
const transcript = (count) => ({
  exitCode: 0,
  stdout: '',
  stderr: Array.from(
    { length: count },
    (_, i) => `NOTICE:  ASSERT ${i + 1}: true checked`
  ).join('\n'),
});
const metadata = {
  events: { before: { activity: 0 }, after: { activity: 0 }, unchanged: true },
  storage: {
    tables: [{ name: 'user_configs' }, { name: 'user_workspace_configs' }],
    publications: [],
    triggers: [],
  },
};
function guestTranscript(events = metadata.events, storage = metadata.storage) {
  return {
    ...transcript(26),
    stdout: `HIDDEN_EVENT_COUNTS: ${JSON.stringify(events)}\nSTORAGE_METADATA: ${JSON.stringify(storage)}`,
  };
}
const failure = (value) => ({
  exitCode: 3,
  stdout: '',
  stderr: `ERROR:  Hidden workspace verification failed: ${value}\nCONTEXT:  PL/pgSQL function inline_code_block`,
});
const rollback = {
  exitCode: 0,
  stdout: 'HIDDEN_ROLLBACK: {"users":0,"workspaces":0}',
  stderr: '',
};

test('accepts NOTICE assertions and historical stdout records across both streams', () => {
  assert.deepEqual(validateFixtureTranscript(transcript(15), 15), {
    assertions: 15,
  });
  const mixed = transcript(15);
  mixed.stdout = mixed.stderr
    .split('\n')
    .slice(0, 4)
    .join('\n')
    .replaceAll('NOTICE:  ', '');
  mixed.stderr = mixed.stderr.split('\n').slice(4).join('\n');
  assert.equal(validateFixtureTranscript(mixed, 15).assertions, 15);
  assert.equal(
    validateFixtureTranscript(guestTranscript(), 26, true).assertions,
    26
  );
});

for (const [name, mutate] of [
  ['nonzero exit', (r) => ({ ...r, exitCode: 3 })],
  ['signal', (r) => ({ ...r, signal: 'SIGTERM' })],
  [
    'missing',
    (r) => ({
      ...r,
      stderr: r.stderr.replace('NOTICE:  ASSERT 1: true checked\n', ''),
    }),
  ],
  ['duplicate', (r) => ({ ...r, stdout: 'ASSERT 1: true duplicate' })],
  ['false', (r) => ({ ...r, stderr: r.stderr.replace('1: true', '1: false') })],
  ['null', (r) => ({ ...r, stderr: r.stderr.replace('1: true', '1: null') })],
  [
    'wrong number',
    (r) => ({ ...r, stderr: r.stderr.replace('15: true', '16: true') }),
  ],
])
  test(`rejects ${name} even with otherwise successful assertions`, () => {
    assert.throws(() => validateFixtureTranscript(mutate(transcript(15)), 15));
  });

test('metadata requires equal counts and unpublished private tables', () => {
  assert.throws(() =>
    validateFixtureTranscript(
      guestTranscript({ ...metadata.events, after: { activity: 1 } }),
      26,
      true
    )
  );
  assert.throws(() =>
    validateFixtureTranscript(
      guestTranscript(metadata.events, {
        ...metadata.storage,
        publications: [{ publication: 'realtime', table: 'user_configs' }],
      }),
      26,
      true
    )
  );
  assert.throws(() =>
    validateFixtureTranscript(
      guestTranscript(metadata.events, { ...metadata.storage, tables: [] }),
      26,
      true
    )
  );
  assert.throws(() => validateFixtureTranscript(transcript(26), 26, true));
});

test('controls must fail for their intended assertion rather than startup errors', () => {
  validateExpectedFailure(failure('ASSERT 1: false'), 1);
  validateExpectedFailure(failure('<NULL>'), null);
  validateExpectedFailure(
    failure('ASSERT 13: false A can restore own preference'),
    13
  );
});

for (const result of [
  { ...failure('ASSERT 1: false'), exitCode: 0 },
  { ...failure('ASSERT 1: false'), signal: 'SIGTERM' },
  failure('permission denied for table user_configs'),
  failure('ASSERT 11: false'),
])
  test(`rejects incidental failure ${result.stderr}`, () => {
    assert.throws(() => validateExpectedFailure(result, 1));
  });

test('source fixtures guard all assertions and restore checks actual absence', () => {
  for (const [sql, count] of [
    [privacySql, 15],
    [guestSql, 26],
  ]) {
    assert.match(sql, /^\\set ON_ERROR_STOP on/m);
    assert.equal(
      (
        sql.match(/raise exception 'Hidden workspace verification failed:/g) ??
        []
      ).length,
      count
    );
    assert.equal(
      (sql.match(/raise notice '%', check_result;/g) ?? []).length,
      count
    );
    assert.deepEqual(
      [...sql.matchAll(/select 'ASSERT (\d+): /gi)].map((m) => Number(m[1])),
      Array.from({ length: count }, (_, i) => i + 1)
    );
    assert.match(sql, /rollback;\s*$/);
    assert.doesNotMatch(
      sql,
      /^\s*(?:create\s+(?:or\s+replace\s+)?function|grant\s+)/im
    );
  }
  assert.match(
    privacySql,
    /ASSERT 13:[\s\S]*?not exists\(select 1 from public.user_workspace_configs[\s\S]*?user_id=auth.uid\(\)/
  );
});

test('controls preserve fixture identity and refuse ambiguous source edits', () => {
  const control = skippedRestoreControl(privacySql);
  assert.equal(
    control.replace(
      "id='HIDDEN_WORKSPACE' and false;",
      "id='HIDDEN_WORKSPACE';"
    ),
    privacySql
  );
  assert.throws(() => skippedRestoreControl('select 1;'));
  assert.throws(() => skippedRestoreControl(privacySql + privacySql));
  for (const value of ['false', 'null']) {
    assert.match(assertionFailureControl(value), /^\\set ON_ERROR_STOP on/);
    assert.match(assertionFailureControl(value), /check_result is null/);
    assert.match(assertionFailureControl(value), /rollback;\s*$/);
  }
  assert.throws(() => assertionFailureControl('true'));
});

const admission = {
  isolated: true,
  parentApproved: true,
  projectId: 'synthetic-isolated',
};
function executor(calls, badName) {
  return async ({ name, projectId }) => {
    assert.equal(projectId, admission.projectId);
    calls.push(name);
    if (name.endsWith('-rollback')) return rollback;
    if (name === badName) return failure('unrelated database startup failure');
    if (name === 'privacy') return transcript(15);
    if (name === 'board-guests') return guestTranscript();
    if (name === 'false-control') return failure('ASSERT 1: false');
    if (name === 'null-control') return failure('<NULL>');
    return failure('ASSERT 13: false A can restore own preference');
  };
}

test('runs sequential fresh sessions and checks rollback after each control', async () => {
  const calls = [];
  const completed = await verifyHiddenWorkspaces({
    admission,
    execute: executor(calls),
    privacySql,
    guestSql,
  });
  assert.equal(completed.length, 5);
  assert.deepEqual(
    calls,
    completed.flatMap((name) => [name, `${name}-rollback`])
  );
});

test('failure checks rollback then stops without running subsequent fixtures', async () => {
  const calls = [];
  await assert.rejects(
    verifyHiddenWorkspaces({
      admission,
      execute: executor(calls, 'privacy'),
      privacySql,
      guestSql,
    })
  );
  assert.deepEqual(calls, ['privacy', 'privacy-rollback']);
});

test('denies an unadmitted executor and rejects retained synthetic rows', async () => {
  let executions = 0;
  await assert.rejects(
    verifyHiddenWorkspaces({
      admission: {},
      execute: () => executions++,
      privacySql,
      guestSql,
    })
  );
  assert.equal(executions, 0);
  await assert.rejects(
    verifyHiddenWorkspaces({
      admission,
      privacySql,
      guestSql,
      execute: async ({ name }) =>
        name.endsWith('-rollback')
          ? {
              ...rollback,
              stdout: 'HIDDEN_ROLLBACK: {"users":1,"workspaces":0}',
            }
          : transcript(15),
    })
  );
});

// Structural regression only: this does not parse or execute PostgreSQL.
test('data-changing CTEs stay inside the assertion query that consumes them', () => {
  for (const sql of [privacySql, guestSql]) {
    assert.doesNotMatch(sql, /with (?:removed|changed) as[^;]*?do \$assert\$/i);
    for (const block of sql.split('do $assert$').slice(1)) {
      const body = block.split('$assert$;')[0];
      for (const cte of ['removed', 'changed']) {
        if (new RegExp(`from ${cte}\\b`, 'i').test(body)) {
          assert.match(body, new RegExp(`begin\\s+with ${cte} as`, 'i'));
        }
      }
    }
  }
  assert.match(
    guestSql,
    /with removed as \(delete from public\.user_workspace_configs[^;]+returning 1\)\s+select 'ASSERT 21:/
  );
});
