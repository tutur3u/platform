const test = require('node:test');
const assert = require('node:assert/strict');

const {
  finalizeMerge,
  parseArgs,
  runReleaseChecks,
  selectReleasePleaseBranch,
} = require('./git-release-please.js');

test('selectReleasePleaseBranch prefers the target release branch', () => {
  const branches = [
    'origin/release-please--branches--staging',
    'origin/release-please--branches--production',
    'origin/release-please--branches--production--release-notes',
  ];

  assert.equal(
    selectReleasePleaseBranch(branches, {
      remote: 'origin',
      targetBranch: 'production',
    }),
    'origin/release-please--branches--production'
  );
});

test('selectReleasePleaseBranch falls back to the newest listed release branch', () => {
  assert.equal(
    selectReleasePleaseBranch(
      [
        'origin/release-please--branches--preview',
        'origin/release-please--branches--staging',
      ],
      {
        remote: 'origin',
        targetBranch: 'production',
      }
    ),
    'origin/release-please--branches--preview'
  );
});

test('parseArgs supports release-please merge overrides', () => {
  assert.deepEqual(
    parseArgs([
      '--base',
      'main',
      '--remote',
      'upstream',
      '--target-branch',
      'production',
      '--skip-fetch',
      '--skip-format',
    ]),
    {
      baseBranch: 'main',
      fetch: false,
      format: false,
      remote: 'upstream',
      targetBranch: 'production',
    }
  );
});

test('runReleaseChecks runs bun check for staged release changes', () => {
  const calls = [];

  runReleaseChecks({
    files: ['packages/sdk/package.json'],
    runCommand: (command, args) => calls.push([command, args]),
  });

  assert.deepEqual(calls, [['bun', ['check']]]);
});

test('runReleaseChecks mirrors mobile pre-commit coverage when mobile is staged', () => {
  const calls = [];

  runReleaseChecks({
    files: ['apps/mobile/pubspec.yaml'],
    runCommand: (command, args) => calls.push([command, args]),
  });

  assert.deepEqual(calls, [
    ['bun', ['check']],
    ['bun', ['check:mobile']],
  ]);
});

test('finalizeMerge runs release checks before creating the merge commit', () => {
  const calls = [];

  finalizeMerge({
    ensureCleanMerge: () => {},
    format: true,
    runCommand: (command, args) => calls.push([command, args]),
    stagedFilesProvider: () => ['packages/sdk/package.json'],
  });

  assert.deepEqual(calls, [
    ['bun', ['release:sync-platform-version']],
    [
      'git',
      [
        'add',
        'packages/utils/src/platform-release.ts',
        'packages/utils/src/platform-release.test.ts',
      ],
    ],
    ['bun', ['ff']],
    ['git', ['add', '--all']],
    ['bun', ['check']],
    ['git', ['commit', '--no-edit']],
  ]);
});
