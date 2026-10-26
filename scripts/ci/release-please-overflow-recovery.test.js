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
  notesBranchFor,
  overflowRecoveryTarget,
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
    async listOpenPullRequests() {
      return [];
    },
    async listClosedPullRequests() {
      return [
        {
          body: 'This release is too large to preview in the pull request body. View the full release notes here: https://github.com/tutur3u/platform/blob/release-please--branches--production--release-notes/release-notes.md',
          base: { ref: 'production', repo: { full_name: 'tutur3u/platform' } },
          head: {
            ref: 'release-please--branches--production',
            repo: { full_name: 'tutur3u/platform' },
          },
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

test('restores missing notes for an open overflow release PR from its head', async () => {
  const changelogRefs = [];
  const base = createFakeGitHub();
  const github = createFakeGitHub({
    async getBranchSha(branchName) {
      // Release Please already reset the notes branch to production.
      return branchName === 'production' ? 'production-sha' : 'production-sha';
    },
    async getTextFile(filePath, ref, options) {
      if (filePath.endsWith('CHANGELOG.md')) changelogRefs.push(ref);
      return base.getTextFile(filePath, ref, options);
    },
    async listClosedPullRequests() {
      return [];
    },
    async listOpenPullRequests(targetBranch) {
      assert.equal(targetBranch, 'production');
      return [
        {
          body: 'This release is too large to preview in the pull request body. View the full release notes here: https://github.com/tutur3u/platform/blob/release-please--branches--production--release-notes/release-notes.md',
          base: { ref: 'production', repo: { full_name: 'tutur3u/platform' } },
          head: {
            ref: 'release-please--branches--production',
            repo: { full_name: 'tutur3u/platform' },
            sha: 'head-sha',
          },
          number: 6623,
        },
      ];
    },
  });

  const result = await recoverReleasePleaseOverflowNotes({ github });

  assert.deepEqual(result, {
    branch: 'release-please--branches--production--release-notes',
    pullRequestNumber: 6623,
    status: 'created',
  });
  // The open release's changelog entries exist only on its head.
  assert.deepEqual(changelogRefs, ['head-sha', 'head-sha']);
  assert.equal(github.calls.length, 1);
  const [kind, filePath, branch, notes] = github.calls[0];
  assert.deepEqual(
    [kind, filePath, branch],
    [
      'createFile',
      'release-notes.md',
      'release-please--branches--production--release-notes',
    ]
  );
  assert.match(notes, /<summary>platform: 0\.4\.0<\/summary>/u);
  assert.match(notes, /<summary>utils: 0\.3\.0<\/summary>/u);
});

test('leaves an open overflow release PR alone while its notes exist', async () => {
  const github = createFakeGitHub({
    async getTextFile(filePath) {
      if (filePath === 'release-notes.md') return 'existing notes';
      throw new Error(`Unexpected file request: ${filePath}`);
    },
    async listClosedPullRequests() {
      return [];
    },
    async listOpenPullRequests() {
      return [
        {
          body: 'This release is too large to preview in the pull request body. View the full release notes here: https://github.com/tutur3u/platform/blob/release-please--branches--production--release-notes/release-notes.md',
          base: { ref: 'production', repo: { full_name: 'tutur3u/platform' } },
          head: {
            ref: 'release-please--branches--production',
            repo: { full_name: 'tutur3u/platform' },
            sha: 'head-sha',
          },
          number: 6623,
        },
      ];
    },
  });

  const result = await recoverReleasePleaseOverflowNotes({ github });

  assert.equal(result.status, 'exists');
  assert.equal(github.calls.length, 0);
});

test('reads files above the contents API size limit through the blob API', async () => {
  const client = new GitHubClient({ repository: 'example/repo', token: 't' });
  const routes = [];
  client.request = async (_method, route) => {
    routes.push(route);
    if (route.startsWith('/contents/')) {
      return { content: '', encoding: 'none', sha: 'blob-sha', type: 'file' };
    }
    return {
      content: Buffer.from('# Changelog', 'utf8').toString('base64'),
      encoding: 'base64',
    };
  };

  assert.equal(await client.getTextFile('CHANGELOG.md', 'head'), '# Changelog');
  assert.deepEqual(routes, ['/contents/CHANGELOG.md', '/git/blobs/blob-sha']);
});

const overflowBody = (branch) =>
  `This release is too large to preview in the pull request body. View the full release notes here: https://github.com/tutur3u/platform/blob/${branch}/release-notes.md`;

function releasePullRequest({ body, headRef, headRepository } = {}) {
  return {
    base: { ref: 'production', repo: { full_name: 'tutur3u/platform' } },
    body:
      body ??
      overflowBody('release-please--branches--production--release-notes'),
    head: {
      ref: headRef ?? 'release-please--branches--production',
      repo: { full_name: headRepository ?? 'tutur3u/platform' },
      sha: 'head-sha',
    },
    merged_at: '2026-06-08T18:53:19Z',
    number: 6623,
  };
}

// Every file read or write, so a refusal can prove it touched nothing.
function trackedGitHub(pullRequests, { merged = false } = {}) {
  const reads = [];
  const base = createFakeGitHub();
  const github = createFakeGitHub({
    async getTextFile(filePath, ref, options) {
      reads.push([filePath, ref]);
      return base.getTextFile(filePath, ref, options);
    },
    async listClosedPullRequests() {
      return merged ? pullRequests : [];
    },
    async listOpenPullRequests() {
      return merged ? [] : pullRequests;
    },
  });
  return { github, reads };
}

test('a fork or lookalike head never selects admin-token overflow recovery', async () => {
  for (const pullRequest of [
    releasePullRequest({ headRepository: 'attacker/platform' }),
    releasePullRequest({ headRef: 'release-please--branches--production-x' }),
    releasePullRequest({ headRef: 'release-please--branches--main' }),
  ]) {
    const { github, reads } = trackedGitHub([pullRequest]);
    const result = await recoverReleasePleaseOverflowNotes({ github });

    assert.equal(result.status, 'skipped');
    assert.deepEqual(github.calls, []);
    assert.deepEqual(reads, []);
  }
});

test('an open release PR body naming production or main is never written to', async () => {
  for (const branch of [
    'production',
    'main',
    'release-please--branches--main--release-notes',
  ]) {
    const { github, reads } = trackedGitHub([
      releasePullRequest({ body: overflowBody(branch) }),
    ]);
    const result = await recoverReleasePleaseOverflowNotes({ github });

    assert.equal(result.status, 'skipped', branch);
    assert.deepEqual(github.calls, [], branch);
    assert.deepEqual(reads, [], branch);
  }
});

test('an edited merged release PR body naming production is refused', async () => {
  const { github, reads } = trackedGitHub(
    [releasePullRequest({ body: overflowBody('production') })],
    { merged: true }
  );
  const result = await recoverReleasePleaseOverflowNotes({ github });

  assert.equal(result.status, 'skipped');
  assert.deepEqual(github.calls, []);
  assert.deepEqual(reads, []);
  assert.equal(
    overflowRecoveryTarget(
      releasePullRequest({ body: overflowBody('production') }),
      'production'
    ),
    undefined
  );
  assert.equal(
    notesBranchFor('production'),
    'release-please--branches--production--release-notes'
  );
});
