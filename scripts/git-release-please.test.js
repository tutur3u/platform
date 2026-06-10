const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
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
      '--skip-check',
    ]),
    {
      baseBranch: 'main',
      check: false,
      fetch: false,
      format: false,
      remote: 'upstream',
      targetBranch: 'production',
    }
  );
});
