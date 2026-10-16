import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { executeOperational } from './operational-cli';
import { initStore, OperationalStore } from './operational-store';

let root: string;
let path: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-graph-cli-synthetic-')));
  path = join(root, 'graph.sqlite');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function file(input: unknown) {
  const path = join(root, 'command.json');
  writeFileSync(path, JSON.stringify(input), { mode: 0o600 });
  return path;
}
function seed() {
  initStore(path, 'backlog');
  const store = new OperationalStore(path, 'backlog', true);
  try {
    store.intake(
      ['canonical-outcome', 'duplicate-outcome'].map((id) => ({
        id,
        title: id,
        kind: 'feature',
        source: 'synthetic:cli',
        acceptance: `Unique ${id}`,
        requiredEvidence: ['focused'],
      })),
      { expectedRevision: 0, operationId: randomUUID() }
    );
  } finally {
    store.close();
  }
}

it('returns localized native graph help without reading auth/config or opening a missing store', () => {
  for (const lang of ['en', 'vi']) {
    expect(
      executeOperational([
        'backlog',
        'graph',
        '--help',
        '--db',
        path,
        '--lang',
        lang,
      ])
    ).toMatchObject({
      group: 'backlog graph',
      commands: [
        'show',
        'readiness',
        'parent',
        'dependency',
        'related',
        'merge',
        'unmerge',
        'close',
        'reopen',
      ],
      liveVerificationPerformed: false,
    });
  }
  expect(existsSync(path)).toBe(false);
});

it('executes the exact native JSON command path, returns one stable receipt, and navigates aliases', () => {
  seed();
  const input = file({
    kind: 'merge',
    canonicalId: 'canonical-outcome',
    memberIds: ['duplicate-outcome'],
    reason: 'Explicit human equivalence',
    confirmation: 'equivalent',
  });
  const args = [
    'backlog',
    'graph',
    'merge',
    '--db',
    path,
    '--file',
    input,
    '--expected-revision',
    '2',
    '--operation-id',
    randomUUID(),
    '--json',
  ];
  const first = executeOperational(args);
  expect(first).toMatchObject({
    result: { changedIds: ['duplicate-outcome'] },
    revision: 3,
    liveVerificationPerformed: false,
  });
  expect(executeOperational(args)).toEqual(first);
  expect(
    executeOperational([
      'backlog',
      'graph',
      'show',
      'duplicate-outcome',
      '--db',
      path,
      '--json',
    ])
  ).toMatchObject({
    id: 'duplicate-outcome',
    canonicalId: 'canonical-outcome',
  });
  expect(
    executeOperational([
      'backlog',
      'graph',
      'readiness',
      'duplicate-outcome',
      '--db',
      path,
      '--json',
    ])
  ).toMatchObject({ ready: false, memberVerificationComplete: false });
});

it('rejects missing confirmation, mismatched actions and read/write flags before opening a writable database', () => {
  const bad = file({
    kind: 'merge',
    canonicalId: 'canonical-outcome',
    memberIds: ['duplicate-outcome'],
    reason: 'Similarity only',
  });
  expect(() =>
    executeOperational([
      'backlog',
      'graph',
      'merge',
      '--db',
      path,
      '--file',
      bad,
      '--expected-revision',
      '0',
      '--operation-id',
      randomUUID(),
    ])
  ).toThrow();
  const other = file({
    kind: 'parent',
    id: 'duplicate-outcome',
    parentId: 'canonical-outcome',
  });
  expect(() =>
    executeOperational([
      'backlog',
      'graph',
      'merge',
      '--db',
      path,
      '--file',
      other,
    ])
  ).toThrow('kind must match');
  expect(() =>
    executeOperational([
      'backlog',
      'graph',
      'show',
      'canonical-outcome',
      '--db',
      path,
      '--file',
      other,
    ])
  ).toThrow('write flags');
  expect(existsSync(path)).toBe(false);
});

it('uses the real local CLI entry before auth/network imports and writes structured errors only once', () => {
  const runtime = process.env.TTR_TEST_BUN ?? 'bun';
  const entry = resolve(import.meta.dirname, 'index.ts');
  const config = join(root, 'synthetic-auth-config.json');
  const env = {
    ...process.env,
    HOME: join(root, 'synthetic-no-auth-home'),
    TUTURUUU_API_URL: 'http://127.0.0.1:1',
    TUTURUUU_DISABLE_UPDATE_CHECK: '1',
    TUTURUUU_CONFIG: config,
  };
  const help = spawnSync(
    runtime,
    [entry, 'backlog', 'graph', 'help', '--json'],
    { env, encoding: 'utf8' }
  );
  expect(help.status).toBe(0);
  expect(help.stderr).toBe('');
  expect(
    z
      .object({ group: z.string(), liveVerificationPerformed: z.boolean() })
      .parse(JSON.parse(help.stdout))
  ).toEqual({ group: 'backlog graph', liveVerificationPerformed: false });
  const failure = spawnSync(
    runtime,
    [
      entry,
      'backlog',
      'graph',
      'show',
      'canonical-outcome',
      '--db',
      path,
      '--json',
    ],
    { env, encoding: 'utf8' }
  );
  expect(failure.status).toBe(2);
  expect(failure.stderr).toBe('');
  expect(failure.stdout.trim().split('\n')).toHaveLength(1);
  expect(
    z
      .object({ error: z.object({ code: z.string() }) })
      .parse(JSON.parse(failure.stdout)).error.code
  ).toBe('STORE_OR_FILE_MISSING');
  expect(existsSync(path)).toBe(false);
  expect(existsSync(config)).toBe(false);
  expect(
    existsSync(
      join(root, 'synthetic-no-auth-home', '.local', 'share', 'tuturuuu')
    )
  ).toBe(false);
});

it('hosted repair CLI show shares alias-parent navigation and follows unmerge', () => {
  seed();
  const writer = new OperationalStore(path, 'backlog', true);
  try {
    writer.intake(
      [
        {
          id: 'child-outcome',
          title: 'Child',
          kind: 'feature',
          source: 'synthetic:cli',
          acceptance: 'Unique child',
          requiredEvidence: ['focused'],
        },
      ],
      { expectedRevision: writer.revision(), operationId: randomUUID() }
    );
  } finally {
    writer.close();
  }
  let revision = 3;
  function command(kind: string, change: unknown, operationId = randomUUID()) {
    const result = executeOperational([
      'backlog',
      'graph',
      kind,
      '--db',
      path,
      '--file',
      file(change),
      '--expected-revision',
      String(revision),
      '--operation-id',
      operationId,
      '--json',
    ]);
    revision++;
    return result;
  }
  command('parent', {
    kind: 'parent',
    id: 'child-outcome',
    parentId: 'duplicate-outcome',
  });
  const mergeOperationId = randomUUID();
  command(
    'merge',
    {
      kind: 'merge',
      canonicalId: 'canonical-outcome',
      memberIds: ['duplicate-outcome'],
      reason: 'Explicit equivalence',
      confirmation: 'equivalent',
    },
    mergeOperationId
  );
  for (const id of ['canonical-outcome', 'duplicate-outcome']) {
    expect(
      executeOperational([
        'backlog',
        'graph',
        'show',
        id,
        '--db',
        path,
        '--json',
      ])
    ).toMatchObject({
      id,
      canonicalId: 'canonical-outcome',
      children: ['child-outcome'],
      liveVerificationPerformed: false,
    });
  }
  expect(() =>
    executeOperational([
      'backlog',
      'graph',
      'show',
      'unknown-outcome',
      '--db',
      path,
      '--json',
    ])
  ).toThrow('unknown request');
  expect(() =>
    command('parent', {
      kind: 'parent',
      id: 'canonical-outcome',
      parentId: 'child-outcome',
    })
  ).toThrow('cycle');
  command('unmerge', {
    kind: 'unmerge',
    id: 'duplicate-outcome',
    mergeOperationId,
    reason: 'Distinct obligation',
  });
  expect(
    executeOperational([
      'backlog',
      'graph',
      'show',
      'canonical-outcome',
      '--db',
      path,
      '--json',
    ])
  ).toMatchObject({ children: [] });
  expect(
    executeOperational([
      'backlog',
      'graph',
      'show',
      'duplicate-outcome',
      '--db',
      path,
      '--json',
    ])
  ).toMatchObject({ children: ['child-outcome'] });
});
