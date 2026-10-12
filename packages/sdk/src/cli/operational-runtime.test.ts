import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('runs real SQLite CLI writes, transfers and notes in the selected Bun runtime', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-runtime-test-')));
  const entry = resolve(import.meta.dirname, 'index.ts');
  const runtime = process.env.TTR_TEST_BUN ?? 'bun';
  function run(args: string[], expected = 0) {
    const result = spawnSync(runtime, [entry, ...args, '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: join(dir, 'no-auth-home'),
        TUTURUUU_API_URL: 'http://127.0.0.1:1',
        TUTURUUU_DISABLE_UPDATE_CHECK: '1',
      },
    });
    expect(result.status, result.stderr || result.stdout).toBe(expected);
    expect(result.stderr).toBe('');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.liveVerificationPerformed).toBe(false);
    return parsed;
  }
  try {
    const incomplete = join(dir, 'incomplete.json');
    writeFileSync(
      incomplete,
      JSON.stringify({
        version: 1,
        units: [
          {
            id: 'runtime-outcome',
            owner: 'test',
            worktree: '/synthetic',
            head: 'a'.repeat(40),
            state: 'merged',
            requiredEvidence: ['focused'],
            evidence: [],
          },
        ],
      }),
      { mode: 0o600 }
    );
    expect(
      run(['backlog', 'evidence-check', '--file', incomplete], 1)
        .recordedEvidenceComplete
    ).toBe(false);
    const db = join(dir, 'backlog.sqlite');
    const input = join(dir, 'intake.json');
    writeFileSync(
      input,
      JSON.stringify([
        {
          id: 'runtime-outcome',
          title: 'Runtime',
          source: 'synthetic:runtime',
          kind: 'feature',
          acceptance: 'Real SQLite',
          requiredEvidence: ['focused'],
        },
      ]),
      { mode: 0o600 }
    );
    run(['backlog', 'init', '--db', db]);
    const operationId = randomUUID();
    const intake = [
      'backlog',
      'intake',
      '--db',
      db,
      '--file',
      input,
      '--expected-revision',
      '0',
      '--operation-id',
      operationId,
    ];
    const receipt = run(intake);
    expect(receipt.revision).toBe(1);
    expect(run(intake)).toEqual(receipt);
    expect(run(['backlog', 'snapshot', '--db', db]).items[0].id).toBe(
      'runtime-outcome'
    );
    run([
      'backlog',
      'update',
      'runtime-outcome',
      '--db',
      db,
      '--status',
      'implemented',
      '--expected-revision',
      '1',
      '--operation-id',
      randomUUID(),
    ]);
    const bundle = join(dir, 'bundle.json');
    run(['backlog', 'export', '--db', db, '--file', bundle]);
    const restore = join(dir, 'restore.sqlite');
    expect(
      run(['backlog', 'import', '--db', restore, '--file', bundle]).dryRun
    ).toBe(true);
    expect(existsSync(restore)).toBe(false);
    run([
      'backlog',
      'import',
      '--db',
      restore,
      '--file',
      bundle,
      '--apply',
      '--expected-revision',
      '0',
      '--operation-id',
      randomUUID(),
    ]);
    expect(
      run(['backlog', 'history', 'runtime-outcome', '--db', restore]).events
    ).toHaveLength(2);
    expect(JSON.parse(readFileSync(bundle, 'utf8')).notes).toEqual([]);
    const memory = join(dir, 'notes.sqlite');
    const note = join(dir, 'note.json');
    run(['operational-memory', 'init', '--db', memory]);
    const record = {
      id: 'runtime-note',
      scope: 'explicit-operational',
      project: 'synthetic',
      source: 'synthetic:runtime',
      summary: 'Separate history',
      evidence: [],
      status: 'active',
    };
    writeFileSync(note, JSON.stringify(record), { mode: 0o600 });
    run([
      'operational-memory',
      'put',
      '--db',
      memory,
      '--file',
      note,
      '--expected-revision',
      '0',
      '--operation-id',
      randomUUID(),
    ]);
    writeFileSync(note, JSON.stringify({ ...record, status: 'tombstone' }));
    run([
      'operational-memory',
      'put',
      '--db',
      memory,
      '--file',
      note,
      '--expected-revision',
      '1',
      '--operation-id',
      randomUUID(),
    ]);
    writeFileSync(note, JSON.stringify(record));
    expect(
      run(
        [
          'operational-memory',
          'put',
          '--db',
          memory,
          '--file',
          note,
          '--expected-revision',
          '2',
          '--operation-id',
          randomUUID(),
        ],
        2
      ).error.code
    ).toBe('DELETION_FENCE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
