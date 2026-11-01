import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DRY_RUN_FLAG, parseDryRunArgs } from './dry-run-args.mjs';
import { describeAdmitPlan } from './wave1-web-admit.mjs';
import { describeRollbackPlan } from './wave1-web-rollback.mjs';
import { describeSealPlan } from './wave1-web-seal.mjs';

const require = createRequire(import.meta.url);
const { describeOverflowRecoveryPlan, parseArgs } = require(
  './release-please-overflow-recovery.js'
);
const sha = 'a'.repeat(40);

// Credential-free environment: a dry run must succeed with nothing set, and
// the flag-absent failure paths below fail on local validation before any I/O.
function run(script, args) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(script, import.meta.url)), ...args],
    { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 30_000 }
  );
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test('parseDryRunArgs consumes only the exact --dry-run token', () => {
  assert.equal(DRY_RUN_FLAG, '--dry-run');
  assert.deepEqual(parseDryRunArgs([]), { dryRun: false, args: [] });
  assert.deepEqual(parseDryRunArgs(['verify', sha]), {
    dryRun: false,
    args: ['verify', sha],
  });
  assert.deepEqual(parseDryRunArgs([sha, '--dry-run']), {
    dryRun: true,
    args: [sha],
  });
  assert.deepEqual(parseDryRunArgs(['--dry-run', 'prepare', sha, 'd', 'o']), {
    dryRun: true,
    args: ['prepare', sha, 'd', 'o'],
  });
  for (const lookalike of [
    '--dry-run=true',
    '--dryrun',
    'dry-run',
    '--Dry-Run',
  ])
    assert.deepEqual(parseDryRunArgs([lookalike]), {
      dryRun: false,
      args: [lookalike],
    });
});

test('parseDryRunArgs does not alias or mutate its input', () => {
  const argv = ['x', '--dry-run'];
  const parsed = parseDryRunArgs(argv);
  assert.deepEqual(argv, ['x', '--dry-run']);
  assert.notEqual(parsed.args, argv);
});

test('admit plan validates the SHA and states that nothing is requested', () => {
  const lines = describeAdmitPlan({ sha });
  assert.match(lines[0], new RegExp(`Would admit ${sha}`, 'u'));
  assert.ok(lines.some((line) => line.includes(`commits/${sha}/check-runs`)));
  assert.match(lines.at(-1), /No request was made/u);
  for (const bad of [undefined, '', 'abc', sha.toUpperCase()])
    assert.throws(
      () => describeAdmitPlan({ sha: bad }),
      /Exact source SHA required/u
    );
});

test('rollback plan names the single write and validates the SHA', () => {
  const lines = describeRollbackPlan({ sha });
  assert.equal(
    lines.filter((line) => line.includes('the only write')).length,
    1
  );
  assert.match(lines.at(-1), /No request was made/u);
  assert.throws(
    () => describeRollbackPlan({ sha: 'nope' }),
    /Exact source SHA required/u
  );
});

test('seal plan covers every mode and rejects unknown ones like main()', () => {
  assert.match(
    describeSealPlan(['prepare', sha, 'dpl_x', 'https://o.example']).join('\n'),
    /dpl_x at https:\/\/o\.example/u
  );
  assert.match(describeSealPlan(['restored', sha]).join('\n'), /config\.json/u);
  assert.match(describeSealPlan(['verify', sha]).join('\n'), /re-verify/u);
  assert.throws(() => describeSealPlan(['bogus', sha]), /Unknown mode bogus/u);
  assert.throws(() => describeSealPlan([]), /Unknown mode undefined/u);
});

test('overflow recovery parseArgs is unchanged without the flag and reads it with it', () => {
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(
    parseArgs([
      '--target-branch',
      'production',
      '--config-file',
      'c.json',
      '--manifest-file',
      'm.json',
      '--repository',
      'o/r',
    ]),
    {
      targetBranch: 'production',
      configFile: 'c.json',
      manifestFile: 'm.json',
      repository: 'o/r',
    }
  );
  assert.deepEqual(parseArgs(['--target-branch', 'production', '--dry-run']), {
    targetBranch: 'production',
    dryRun: true,
  });
});

test('overflow recovery plan defaults match the real defaults', () => {
  const text = describeOverflowRecoveryPlan({}, {}).join('\n');
  assert.match(text, /\(unset\)/u);
  assert.match(text, /target branch production/u);
  assert.match(text, /release-please-config\.json/u);
  assert.match(text, /\.release-please-manifest\.json/u);
  assert.match(
    describeOverflowRecoveryPlan(
      { repository: 'o/r', targetBranch: 'production' },
      { GITHUB_REPOSITORY: 'ignored/ignored' }
    ).join('\n'),
    /for o\/r /u
  );
});

test('--dry-run exits 0 with no environment and no network', () => {
  for (const [script, args] of [
    ['wave1-web-admit.mjs', [sha, '--dry-run']],
    ['wave1-web-admit.mjs', ['--dry-run', sha]],
    ['wave1-web-rollback.mjs', [sha, '--dry-run']],
    ['wave1-web-seal.mjs', ['verify', sha, '--dry-run']],
    [
      'wave1-web-seal.mjs',
      ['prepare', sha, 'dpl_x', 'https://o.example', '--dry-run'],
    ],
    [
      'release-please-overflow-recovery.js',
      ['--target-branch', 'production', '--repository', 'o/r', '--dry-run'],
    ],
  ]) {
    const { code, out, err } = run(script, args);
    assert.equal(code, 0, `${script} ${args.join(' ')}: ${err}`);
    assert.match(out, /\[dry-run\]/u);
    assert.equal(err, '');
  }
});

test('without --dry-run the default path still fails on local validation first', () => {
  for (const script of ['wave1-web-admit.mjs', 'wave1-web-rollback.mjs']) {
    const { code, out, err } = run(script, ['not-a-sha']);
    assert.equal(code, 1, script);
    assert.equal(out, '');
    assert.match(
      err,
      /Exact source SHA required|Automatic Worker rollback failed/u
    );
  }
  const seal = run('wave1-web-seal.mjs', ['bogus']);
  assert.equal(seal.code, 1);
  assert.match(seal.err, /Unknown mode bogus/u);
  const dryBad = run('wave1-web-admit.mjs', ['not-a-sha', '--dry-run']);
  assert.equal(dryBad.code, 1);
  assert.match(dryBad.err, /Exact source SHA required/u);
});
