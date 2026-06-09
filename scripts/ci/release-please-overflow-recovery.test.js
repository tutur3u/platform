const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReleaseNotesDocument,
  extractChangelogEntry,
  extractOverflowBranchName,
  getChangelogPath,
  getComponent,
  parseManifestVersionChanges,
  recoverReleasePleaseOverflowNotes,
} = require('./release-please-overflow-recovery.js');

function createFakeGitHub(overrides = {}) {
  const calls = [];
  const fake = {
    calls,
    async createBranch(branchName, sha) {
      calls.push(['createBranch', branchName, sha]);
    },
    async createFile(filePath, branchName, content, message) {
      calls.push(['createFile', filePath, branchName, content, message]);
    },
    async getBranchSha(branchName) {
      if (branchName === 'production') return 'production-sha';
      return undefined;
    },
    async getIssueLabels() {
      return ['autorelease: pending'];
    },
    async getJsonFile() {
      return {
        packages: {
          '.': {
            component: 'platform',
            'changelog-path': 'CHANGELOG.md',
          },
          'packages/utils': {
            component: 'utils',
          },
        },
      };
    },
    async getPullRequestFiles() {
      return [
        {
          filename: '.release-please-manifest.json',
          patch: [
            '@@ -1,4 +1,4 @@',
            ' {',
            '-  ".": "0.3.0",',
            '-  "packages/utils": "0.2.0"',
            '+  ".": "0.4.0",',
            '+  "packages/utils": "0.3.0"',
            ' }',
          ].join('\n'),
        },
      ];
    },
    async getTextFile(filePath, ref) {
      if (filePath === 'release-notes.md' && ref.includes('release-notes')) {
        return undefined;
      }

      if (filePath === 'CHANGELOG.md') {
        return [
          '# Changelog',
          '',
          '## [0.4.0](https://example.com/platform) (2026-06-08)',
          '',
          '### Features',
          '',
          '* **web:** add dashboard polish',
          '',
          '## [0.3.0](https://example.com/old) (2026-06-03)',
        ].join('\n');
      }

      if (filePath === 'packages/utils/CHANGELOG.md') {
        return [
          '# Changelog',
          '',
          '## [0.3.0](https://example.com/utils) (2026-06-08)',
          '',
          '### Bug Fixes',
          '',
          '* **utils:** stabilize release metadata',
        ].join('\n');
      }

      throw new Error(`Unexpected file request: ${filePath}`);
    },
    async listClosedPullRequests() {
      return [
        {
          body: 'This release is too large to preview in the pull request body. View the full release notes here: https://github.com/tutur3u/platform/blob/release-please--branches--production--release-notes/release-notes.md',
          head: { ref: 'release-please--branches--production' },
          merged_at: '2026-06-08T18:53:19Z',
          number: 4767,
        },
      ];
    },
    ...overrides,
  };

  return fake;
}

test('extracts the overflow release notes branch from a pull request body', () => {
  assert.equal(
    extractOverflowBranchName(
      'This release is too large to preview in the pull request body. View the full release notes here: https://github.com/tutur3u/platform/blob/release-please--branches--production--release-notes/release-notes.md'
    ),
    'release-please--branches--production--release-notes'
  );
});

test('parses changed versions from the manifest patch', () => {
  assert.deepEqual(
    parseManifestVersionChanges(
      [
        '@@ -1,4 +1,4 @@',
        ' {',
        '-  ".": "0.3.0",',
        '-  "apps/mobile": "0.5.1",',
        '-  "packages/utils": "0.2.0"',
        '+  ".": "0.4.0",',
        '+  "apps/mobile": "0.5.1",',
        '+  "packages/utils": "0.3.0"',
        ' }',
      ].join('\n')
    ),
    [
      {
        previousVersion: '0.3.0',
        releasePath: '.',
        version: '0.4.0',
      },
      {
        previousVersion: '0.2.0',
        releasePath: 'packages/utils',
        version: '0.3.0',
      },
    ]
  );
});

test('resolves changelog paths and components from release-please config', () => {
  const config = {
    packages: {
      '.': {
        component: 'platform',
        'changelog-path': 'CHANGELOG.md',
      },
      'packages/utils': {
        component: 'utils',
      },
    },
  };

  assert.equal(getChangelogPath(config, '.'), 'CHANGELOG.md');
  assert.equal(
    getChangelogPath(config, 'packages/utils'),
    'packages/utils/CHANGELOG.md'
  );
  assert.equal(getComponent(config, '.'), 'platform');
  assert.equal(getComponent(config, 'packages/utils'), 'utils');
});

test('extracts the requested changelog entry', () => {
  assert.equal(
    extractChangelogEntry(
      [
        '# Changelog',
        '',
        '## [0.4.0](https://example.com) (2026-06-08)',
        '',
        '### Features',
        '',
        '* add recovery',
        '',
        '## [0.3.0](https://example.com) (2026-06-03)',
      ].join('\n'),
      '0.4.0'
    ),
    [
      '## [0.4.0](https://example.com) (2026-06-08)',
      '',
      '### Features',
      '',
      '* add recovery',
    ].join('\n')
  );
});

test('builds a Release Please parseable overflow body', () => {
  const body = buildReleaseNotesDocument([
    {
      component: 'platform',
      notes: '## [0.4.0](https://example.com)\n\n### Features',
      version: '0.4.0',
    },
  ]);

  assert.match(body, /:robot: I have created a release \*beep\* \*boop\*/);
  assert.match(body, /<details><summary>platform: 0\.4\.0<\/summary>/);
  assert.match(body, /This PR was generated with \[Release Please\]/);
});

test('recovers a missing overflow release-notes branch and file', async () => {
  const github = createFakeGitHub();
  const result = await recoverReleasePleaseOverflowNotes({ github });
  const createFileCall = github.calls.find((call) => call[0] === 'createFile');

  assert.deepEqual(result, {
    branch: 'release-please--branches--production--release-notes',
    pullRequestNumber: 4767,
    status: 'created',
  });
  assert.deepEqual(github.calls[0], [
    'createBranch',
    'release-please--branches--production--release-notes',
    'production-sha',
  ]);
  assert.equal(createFileCall[1], 'release-notes.md');
  assert.match(createFileCall[3], /<summary>platform: 0\.4\.0<\/summary>/);
  assert.match(createFileCall[3], /<summary>utils: 0\.3\.0<\/summary>/);
});

test('skips recovery when the overflow file already exists', async () => {
  const github = createFakeGitHub({
    async getTextFile(filePath, ref) {
      if (filePath === 'release-notes.md' && ref.includes('release-notes')) {
        return 'existing notes';
      }

      throw new Error(`Unexpected file request: ${filePath}`);
    },
  });
  const result = await recoverReleasePleaseOverflowNotes({ github });

  assert.deepEqual(result, {
    branch: 'release-please--branches--production--release-notes',
    pullRequestNumber: 4767,
    status: 'exists',
  });
  assert.equal(github.calls.length, 0);
});
