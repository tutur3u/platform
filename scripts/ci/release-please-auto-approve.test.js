const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildAllowedPaths,
  evaluateReleasePullRequest,
} = require('./release-please-auto-approve-core.js');
const {
  autoApproveReleasePullRequest,
  hasCurrentApproval,
  parseApprovedAuthors,
  parseArgs,
} = require('./release-please-auto-approve.js');
const { repoRoot } = require('./workflow-config-test-helpers.js');
const { discoverScriptTests } = require('../run-script-tests.js');

const config = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'release-please-config.json'), 'utf8')
);

function releaseCommit(overrides = {}) {
  return {
    author: { login: 'github-actions[bot]' },
    commit: { message: 'chore(release): release production\n\nnotes' },
    sha: 'abc123def456',
    ...overrides,
  };
}

function releasePullRequest(overrides = {}) {
  return {
    base: { ref: 'production' },
    draft: false,
    head: { ref: 'release-please--branches--production', sha: 'headsha' },
    number: 5076,
    state: 'open',
    user: { login: 'github-actions[bot]', type: 'Bot' },
    ...overrides,
  };
}

function evaluate({ commits, files, pullRequest, ...rest } = {}) {
  return evaluateReleasePullRequest({
    allowedPaths: buildAllowedPaths(config),
    commits: commits ?? [releaseCommit()],
    files: files ?? [{ filename: 'CHANGELOG.md' }],
    pullRequest: pullRequest ?? releasePullRequest(),
    targetBranch: 'production',
    ...rest,
  });
}

test('the allowlist covers every path a real release pull request changed', () => {
  // Sampled from PR #5076, the release that had to be landed by hand.
  const observed = [
    '.release-please-manifest.json',
    'CHANGELOG.md',
    'platform-version.txt',
    'apps/ai/CHANGELOG.md',
    'apps/ai/package.json',
    'apps/mobile/CHANGELOG.md',
    'apps/mobile/pubspec.yaml',
    'packages/ui/CHANGELOG.md',
    'packages/ui/package.json',
    'packages/utils/src/platform-release.ts',
    'packages/utils/src/platform-release.test.ts',
  ];
  const allowed = buildAllowedPaths(config);

  for (const filename of observed) {
    assert.ok(allowed.has(filename), `${filename} must be an allowed path`);
  }
});

test('the allowlist is derived from the config, not hard-coded', () => {
  const allowed = buildAllowedPaths({
    packages: {
      '.': {
        'changelog-path': 'CHANGELOG.md',
        'extra-files': [{ path: 'packages/utils/src/platform-release.ts' }],
        'release-type': 'simple',
        'version-file': 'platform-version.txt',
      },
      'apps/thing': { 'release-type': 'dart' },
      'packages/thing': {},
    },
    'release-type': 'node',
  });

  assert.deepEqual(
    [...allowed].sort(),
    [
      '.release-please-manifest.json',
      'CHANGELOG.md',
      'apps/thing/CHANGELOG.md',
      'apps/thing/pubspec.yaml',
      'packages/thing/CHANGELOG.md',
      'packages/thing/package.json',
      'packages/utils/src/platform-release.ts',
      'platform-version.txt',
    ].sort()
  );
});

test('an unknown release type contributes no version file', () => {
  // Narrowing on an unrecognised type is the safe direction: the bump shows up
  // as an unexpected path and the PR is left for a human.
  const allowed = buildAllowedPaths({
    packages: { 'apps/thing': { 'release-type': 'rust' } },
  });

  assert.ok(!allowed.has('apps/thing/Cargo.toml'));
  assert.ok(allowed.has('apps/thing/CHANGELOG.md'));
});

test('an untouched generated release pull request is approved', () => {
  const decision = evaluate({
    files: [
      { filename: 'CHANGELOG.md' },
      { filename: 'apps/mobile/pubspec.yaml' },
      { filename: '.release-please-manifest.json' },
    ],
  });

  assert.equal(decision.approve, true);
});

test('a pull request touching anything release-please does not generate is skipped', () => {
  const decision = evaluate({
    files: [
      { filename: 'CHANGELOG.md' },
      { filename: 'apps/web/src/app/page.tsx' },
    ],
  });

  assert.equal(decision.approve, false);
  assert.match(decision.reason, /apps\/web\/src\/app\/page\.tsx/);
});

test('a commit from anyone other than the pull request author is skipped', () => {
  const decision = evaluate({
    commits: [
      releaseCommit(),
      releaseCommit({ author: { login: 'someone-else' }, sha: 'deadbeef1234' }),
    ],
  });

  assert.equal(decision.approve, false);
  assert.match(decision.reason, /someone-else/);
});

test('a commit with no resolvable author is skipped', () => {
  // An unsigned or unlinked commit must not be read as "the bot did it".
  const decision = evaluate({
    commits: [releaseCommit({ author: null, committer: null })],
  });

  assert.equal(decision.approve, false);
  assert.match(decision.reason, /unknown account/);
});

test('a commit that is not a release commit is skipped', () => {
  const decision = evaluate({
    commits: [
      releaseCommit({ commit: { message: 'fix(web): sneak something in' } }),
    ],
  });

  assert.equal(decision.approve, false);
  assert.match(decision.reason, /not a release commit/);
});

test('a human-opened pull request on a release-shaped branch is skipped', () => {
  const decision = evaluate({
    commits: [releaseCommit({ author: { login: 'a-person' } })],
    pullRequest: releasePullRequest({
      user: { login: 'a-person', type: 'User' },
    }),
  });

  assert.equal(decision.approve, false);
  assert.match(decision.reason, /not a release automation identity/);
});

test('a non-release branch, a draft, and a closed pull request are all skipped', () => {
  assert.match(
    evaluate({
      pullRequest: releasePullRequest({ head: { ref: 'feature/whatever' } }),
    }).reason,
    /not a release-please branch/
  );
  assert.match(
    evaluate({ pullRequest: releasePullRequest({ draft: true }) }).reason,
    /draft/
  );
  assert.match(
    evaluate({ pullRequest: releasePullRequest({ state: 'closed' }) }).reason,
    /closed/
  );
});

test('a pull request against another base branch is skipped', () => {
  const decision = evaluate({
    pullRequest: releasePullRequest({ base: { ref: 'main' } }),
  });

  assert.equal(decision.approve, false);
  assert.match(decision.reason, /targets main/);
});

test('an approval only counts when it matches the current head', () => {
  const reviews = [
    { commit_id: 'oldsha', state: 'APPROVED' },
    { commit_id: 'headsha', state: 'COMMENTED' },
  ];

  assert.equal(hasCurrentApproval(reviews, 'headsha'), false);
  assert.equal(
    hasCurrentApproval(
      [{ commit_id: 'headsha', state: 'APPROVED' }],
      'headsha'
    ),
    true
  );
});

test('approved authors fall back to the default when the override is empty', () => {
  assert.deepEqual(parseApprovedAuthors(''), ['github-actions[bot]']);
  assert.deepEqual(parseApprovedAuthors('  ,  '), ['github-actions[bot]']);
  assert.deepEqual(parseApprovedAuthors('a-bot, b-bot'), ['a-bot', 'b-bot']);
});

test('arguments are parsed and unknown flags are rejected', () => {
  assert.deepEqual(parseArgs(['--target-branch', 'staging']), {
    configFile: 'release-please-config.json',
    targetBranch: 'staging',
  });
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.throws(() => parseArgs(['--nope']), /Unknown argument/);
});

function stubGitHub({ pullRequest, commits, files, reviews, onApprove }) {
  return {
    approve: async (number, body) => onApprove?.(number, body),
    findReleasePullRequest: async () => pullRequest,
    listAll: async (route) => (route === 'commits' ? commits : files),
    listReviews: async () => reviews || [],
  };
}

test('approving posts exactly one review and reports it', async () => {
  const approvals = [];
  const result = await autoApproveReleasePullRequest({
    config,
    github: stubGitHub({
      commits: [releaseCommit()],
      files: [{ filename: 'CHANGELOG.md' }],
      onApprove: (number) => approvals.push(number),
      pullRequest: releasePullRequest(),
    }),
    targetBranch: 'production',
  });

  assert.equal(result.status, 'approved');
  assert.deepEqual(approvals, [5076]);
});

test('a dry run reports the decision without posting a review', async () => {
  let approved = false;
  const result = await autoApproveReleasePullRequest({
    config,
    dryRun: true,
    github: stubGitHub({
      commits: [releaseCommit()],
      files: [{ filename: 'CHANGELOG.md' }],
      onApprove: () => {
        approved = true;
      },
      pullRequest: releasePullRequest(),
    }),
    targetBranch: 'production',
  });

  assert.equal(result.status, 'dry-run');
  assert.equal(approved, false);
});

test('an already-approved head is left alone', async () => {
  let approved = false;
  const result = await autoApproveReleasePullRequest({
    config,
    github: stubGitHub({
      commits: [releaseCommit()],
      files: [{ filename: 'CHANGELOG.md' }],
      onApprove: () => {
        approved = true;
      },
      pullRequest: releasePullRequest(),
      reviews: [{ commit_id: 'headsha', state: 'APPROVED' }],
    }),
    targetBranch: 'production',
  });

  assert.equal(result.status, 'unchanged');
  assert.equal(approved, false);
});

test('no open release pull request is a clean no-op', async () => {
  const result = await autoApproveReleasePullRequest({
    config,
    github: stubGitHub({ pullRequest: undefined }),
    targetBranch: 'production',
  });

  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /no open release-please pull request/);
});

test('a self-approval refusal is reported, not thrown', async () => {
  // This is the state until RELEASE_PLEASE_TOKEN exists: release-please and
  // this job are both github-actions[bot], and GitHub refuses the review.
  const result = await autoApproveReleasePullRequest({
    config,
    github: stubGitHub({
      commits: [releaseCommit()],
      files: [{ filename: 'CHANGELOG.md' }],
      onApprove: () => {
        const error = new Error('Can not approve your own pull request');
        error.status = 422;
        throw error;
      },
      pullRequest: releasePullRequest(),
    }),
    targetBranch: 'production',
  });

  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /RELEASE_PLEASE_TOKEN/);
});

test('any other API failure still fails the run', async () => {
  await assert.rejects(
    autoApproveReleasePullRequest({
      config,
      github: stubGitHub({
        commits: [releaseCommit()],
        files: [{ filename: 'CHANGELOG.md' }],
        onApprove: () => {
          const error = new Error('Server Error');
          error.status = 500;
          throw error;
        },
        pullRequest: releasePullRequest(),
      }),
      targetBranch: 'production',
    }),
    /Server Error/
  );
});

test('the release workflow runs the auto approve step with pull-request write access', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'release-please.yaml'),
    'utf8'
  );

  assert.match(
    workflow,
    /node scripts\/ci\/release-please-auto-approve\.js --target-branch production/
  );
  assert.ok(
    workflow.indexOf('googleapis/release-please-action@v5') <
      workflow.indexOf('release-please-auto-approve.js'),
    'the release PR must exist before it can be approved'
  );
  assert.match(
    workflow,
    /GITHUB_TOKEN: \$\{\{ github\.token \}\}/,
    'the approval must come from GITHUB_TOKEN, not the identity that opened the PR'
  );
  assert.match(workflow, /pull-requests: write/);
});

test('the auto approve test is covered by script-test discovery', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  );

  assert.equal(
    packageJson.scripts['test:scripts'],
    'node scripts/run-script-tests.js'
  );
  assert.ok(
    discoverScriptTests({ repoRoot }).includes(
      'scripts/ci/release-please-auto-approve.test.js'
    ),
    'the release auto-approve test must remain discoverable'
  );
});
