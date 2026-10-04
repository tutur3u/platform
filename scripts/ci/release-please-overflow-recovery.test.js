const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GitHubClient,
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
    async createBranchWithFile(branchName, sha, filePath, content, message) {
      calls.push([
        'createBranchWithFile',
        branchName,
        sha,
        filePath,
        content,
        message,
      ]);
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
  const createFileCall = github.calls.find(
    (call) => call[0] === 'createBranchWithFile'
  );

  assert.deepEqual(result, {
    branch: 'release-please--branches--production--release-notes',
    pullRequestNumber: 4767,
    status: 'created',
  });
  assert.equal(github.calls.length, 1);
  assert.deepEqual(createFileCall.slice(0, 4), [
    'createBranchWithFile',
    'release-please--branches--production--release-notes',
    'production-sha',
    'release-notes.md',
  ]);
  assert.match(createFileCall[4], /<summary>platform: 0\.4\.0<\/summary>/);
  assert.match(createFileCall[4], /<summary>utils: 0\.3\.0<\/summary>/);
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

test('atomic recovery publishes the ref only after the final content commit exists', async () => {
  const client = new GitHubClient({
    repository: 'example/repo',
    token: 'synthetic',
  });
  const calls = [];
  client.request = async (method, path, options) => {
    calls.push({ method, path, body: options?.body });
    if (path === '/git/commits/base') return { tree: { sha: 'base-tree' } };
    return {
      sha:
        path === '/git/blobs'
          ? 'notes-blob'
          : path === '/git/trees'
            ? 'notes-tree'
            : 'final-commit',
    };
  };
  await client.createBranchWithFile(
    'notes',
    'base',
    'release-notes.md',
    'Synthetic notes',
    'Synthetic recovery'
  );
  assert.deepEqual(
    calls.map(({ path }) => path),
    [
      '/git/commits/base',
      '/git/blobs',
      '/git/trees',
      '/git/commits',
      '/git/refs',
    ]
  );
  assert.deepEqual(calls[2].body, {
    base_tree: 'base-tree',
    tree: [
      {
        path: 'release-notes.md',
        mode: '100644',
        type: 'blob',
        sha: 'notes-blob',
      },
    ],
  });
  assert.deepEqual(calls[3].body.parents, ['base']);
  assert.equal(calls[4].body.sha, 'final-commit');
});

test('failure before final commit publication never creates a bootstrap ref', async () => {
  const client = new GitHubClient({
    repository: 'example/repo',
    token: 'synthetic',
  });
  const paths = [];
  client.request = async (_method, path) => {
    paths.push(path);
    if (path === '/git/commits/base') return { tree: { sha: 'base-tree' } };
    throw new Error('Synthetic blob failure');
  };
  await assert.rejects(
    client.createBranchWithFile(
      'notes',
      'base',
      'release-notes.md',
      'notes',
      'recovery'
    ),
    /Synthetic blob failure/
  );
  assert.deepEqual(paths, ['/git/commits/base', '/git/blobs']);
});
