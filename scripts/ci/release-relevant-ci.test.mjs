import assert from 'node:assert/strict';
import test from 'node:test';
import { admitRelease } from './meet-standalone-release.mjs';
import {
  equivalentCandidates,
  equivalentAncestors,
  externalReferences,
  MAX_EQUIVALENT_DISTANCE,
  runExecuted,
  readWorkspaceManifests,
  touchesRelevant,
  workspaceClosure,
} from './release-relevant-ci.mjs';

const source = 'a'.repeat(40);
const live = 'b'.repeat(40);
const near = 'c'.repeat(40);
const far = 'd'.repeat(40);
const manifests = new Map([
  [
    'apps/meet',
    {
      name: '@tuturuuu/meet',
      dependencies: { '@tuturuuu/ui': 'workspace:*', react: '19' },
    },
  ],
  [
    'packages/ui',
    {
      name: '@tuturuuu/ui',
      devDependencies: { '@tuturuuu/utils': 'workspace:*' },
    },
  ],
  [
    'packages/utils',
    {
      name: '@tuturuuu/utils',
      peerDependencies: { '@tuturuuu/ui': 'workspace:*' },
    },
  ],
  [
    'apps/web',
    { name: '@tuturuuu/web', dependencies: { '@tuturuuu/ui': 'workspace:*' } },
  ],
  ['packages/ai', { name: '@tuturuuu/ai' }],
]);
const closure = ['apps/meet', 'packages/ui', 'packages/utils'];

test('the closure follows every workspace dependency field, once', () => {
  assert.deepEqual(workspaceClosure('apps/meet', manifests), closure);
  assert.throws(
    () => workspaceClosure('apps/none', manifests),
    /RELEASE_CI_APP_MANIFEST/
  );
});

test('manifests come from the source commit and skip directories without one', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'ls-tree')
      return 'apps/meet\napps/notes.md\npackages/ui\npackages/empty\n';
    if (args[1] === `${source}:packages/empty/package.json`)
      throw new Error('missing');
    return JSON.stringify({ name: args[1] });
  };
  const read = readWorkspaceManifests(git, source);
  assert.deepEqual(
    [...read.keys()],
    ['apps/meet', 'apps/notes.md', 'packages/ui']
  );
  assert.equal(calls[0], `ls-tree --name-only ${source} apps/ packages/`);
  assert.throws(() => readWorkspaceManifests(git, 'HEAD'), /RELEASE_CI_SOURCE/);
  assert.throws(
    () =>
      readWorkspaceManifests(
        (args) => (args[0] === 'ls-tree' ? 'apps/meet' : '{'),
        source
      ),
    /RELEASE_CI_MANIFEST_UNREADABLE/
  );
});

test('closure files, root config, shared actions, the workflow and patches are relevant', () => {
  for (const file of [
    'apps/meet/src/page.tsx',
    'packages/utils/src/x.ts',
    'bun.lock',
    'tsconfig.json',
    '.github/actions/setup-bun-with-retry/action.yml',
    '.github/workflows/type-check.yaml',
    'patches/foo.patch',
  ])
    assert.equal(
      touchesRelevant([file], closure, 'type-check.yaml'),
      true,
      file
    );
  for (const file of [
    'apps/web/src/page.tsx',
    'packages/ai/src/x.ts',
    'packages/ui-extra/x.ts',
    '.github/workflows/oxc-check.yaml',
    'scripts/ci/other.js',
    'apps/docs/x.mdx',
  ])
    assert.equal(
      touchesRelevant([file], closure, 'type-check.yaml'),
      false,
      file
    );
});

const run = (sha, extra = {}) => ({
  id: 100 + Number.parseInt(sha[0], 16),
  head_sha: sha,
  run_number: 5,
  run_attempt: 1,
  repository: { full_name: 'tutur3u/platform' },
  head_repository: { full_name: 'tutur3u/platform' },
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  ...extra,
});

test('candidates are green main runs of other commits, newest first, once each', () => {
  const payload = {
    workflow_runs: [
      run(far, { run_number: 1 }),
      run(near, { run_number: 4 }),
      run(near, { run_number: 3 }),
      run(source, { run_number: 9 }),
      run('e'.repeat(40), { run_number: 8, conclusion: 'failure' }),
      run('f'.repeat(40), { run_number: 7, event: 'pull_request' }),
      run('1'.repeat(40), { run_number: 6, head_branch: 'production' }),
      run('2'.repeat(40), {
        run_number: 6,
        head_repository: { full_name: 'fork/platform' },
      }),
      run('3'.repeat(40), { run_number: 6, id: 10 }),
    ],
  };
  assert.deepEqual(equivalentCandidates(payload, source, '10'), [near, far]);
  assert.throws(
    () => equivalentCandidates({}, source, '10'),
    /RELEASE_CI_RESPONSE/
  );
});

function history({ distances, diffs, unrelated = [] }) {
  return (args) => {
    if (args[0] === 'merge-base') {
      const [older, newer] = args.slice(2);
      if (
        unrelated.includes(older) ||
        unrelated.includes(newer) ||
        older === source
      )
        throw Object.assign(new Error('not ancestor'), { status: 1 });
      return '';
    }
    if (args[0] === 'rev-list')
      return String(distances[args[2].split('..')[0]]);
    if (args[0] === 'diff') return diffs[args[3]].join('\n');
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

test('untouched ancestors qualify, nearest first; touched, distant and descendant ones never', () => {
  const call = (git, extra = {}) =>
    equivalentAncestors({
      candidates: [far, near],
      closure,
      git,
      source,
      workflow: 'type-check.yaml',
      ...extra,
    });
  const both = history({
    distances: { [near]: 2, [far]: 9 },
    diffs: { [near]: ['apps/web/a.ts'], [far]: ['packages/ai/x.ts'] },
  });
  assert.deepEqual(call(both), [
    { sha: near, distance: 2 },
    { sha: far, distance: 9 },
  ]);
  const touched = history({
    distances: { [near]: 2, [far]: 9 },
    diffs: { [near]: ['packages/ui/a.ts'], [far]: ['bun.lock'] },
  });
  assert.deepEqual(call(touched), []);
  const distant = history({
    distances: {
      [near]: MAX_EQUIVALENT_DISTANCE + 1,
      [far]: MAX_EQUIVALENT_DISTANCE + 9,
    },
    diffs: { [near]: [], [far]: [] },
  });
  assert.deepEqual(call(distant), []);
  // A referenced file outside the closure is relevant.
  const referenced = history({
    distances: { [near]: 2, [far]: 9 },
    diffs: {
      [near]: ['scripts/ci/meet-native-policy.mjs'],
      [far]: ['scripts/ci/meet-native-policy.mjs'],
    },
  });
  assert.deepEqual(
    call(referenced, { references: ['scripts/ci/meet-native-policy.mjs'] }),
    []
  );
  // Descendants (and commits off the line) never qualify.
  const offLine = history({ distances: {}, diffs: {}, unrelated: [near, far] });
  assert.deepEqual(call(offLine), []);
});

const job = (name, conclusion = 'success', steps) => ({
  name,
  conclusion,
  steps,
});
test('a green run counts only when its checks executed', () => {
  const ran = [
    job('Type Check', 'success', [
      { name: 'Run type check', conclusion: 'success' },
      { name: 'Report skipped type check', conclusion: 'skipped' },
    ]),
    job('Type Check', 'skipped'),
  ];
  assert.equal(runExecuted('type-check.yaml', { jobs: ran }), true);
  // Release-only pushes conclude success with the heavy steps skipped.
  const skipped = [
    job('Type Check', 'success', [
      { name: 'Run type check', conclusion: 'skipped' },
      { name: 'Report skipped type check', conclusion: 'success' },
    ]),
  ];
  assert.equal(runExecuted('type-check.yaml', { jobs: skipped }), false);
  const shards = [0, 1, 2, 3].map((n) => job(`Unit test shard (${n})`));
  assert.equal(
    runExecuted('turbo-unit-tests.yaml', {
      jobs: [...shards, job('Root script tests (24)')],
    }),
    true
  );
  assert.equal(
    runExecuted('turbo-unit-tests.yaml', {
      jobs: [
        ...shards.slice(1),
        job('Unit test shard (0)', 'skipped'),
        job('Root script tests (24)'),
      ],
    }),
    false
  );
  assert.equal(runExecuted('turbo-unit-tests.yaml', { jobs: shards }), false);
  assert.equal(
    runExecuted('oxc-check.yaml', {
      jobs: [job('Oxlint Lint Check'), job('Oxfmt Format Check')],
    }),
    true
  );
  assert.equal(
    runExecuted('oxc-check.yaml', {
      jobs: [job('Oxlint Lint Check'), job('Oxfmt Format Check', 'skipped')],
    }),
    false
  );
  assert.throws(
    () => runExecuted('codeql.yml', { jobs: [] }),
    /RELEASE_CI_WORKFLOW/
  );
  assert.throws(() => runExecuted('oxc-check.yaml', {}), /RELEASE_CI_RESPONSE/);
});

test('relative references outside the closure are found, minus prose and installs', () => {
  const output = [
    `${source}:apps/meet/src/a.test.ts:../../../scripts/ci/meet-native-policy.mjs`,
    `${source}:apps/meet/src/a.ts:../lib/inside`,
    `${source}:apps/meet/package.json:../database`,
    `${source}:packages/ui/README.md:../../apps/web`,
    `${source}:packages/ui/src/x.test.ts:../..`,
    `${source}:apps/meet/x.ts:../../node_modules/wrangler/x.json`,
    `${source}:apps/meet/x.ts:../../../outside`,
    `${source}:packages/utils/src/x.ts:../../ui/src/y`,
  ].join('\n');
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return output;
  };
  assert.deepEqual(externalReferences(git, source, closure), [
    'apps/database',
    'scripts/ci/meet-native-policy.mjs',
  ]);
  assert.deepEqual(calls[0].slice(-closure.length - 2), [
    source,
    '--',
    ...closure,
  ]);
  const none = () => {
    throw Object.assign(new Error('no match'), { status: 1 });
  };
  assert.deepEqual(externalReferences(none, source, closure), []);
  assert.throws(() =>
    externalReferences(
      () => {
        throw Object.assign(new Error('fatal'), { status: 128 });
      },
      source,
      closure
    )
  );
  assert.equal(
    touchesRelevant(['apps/database/x.sql'], closure, 'x', ['apps/database']),
    true
  );
  assert.equal(
    touchesRelevant(['scripts/ci/meet-native-policy.mjs'], closure, 'x', [
      'scripts/ci/meet-native-policy',
    ]),
    true
  );
  assert.equal(
    touchesRelevant(['scripts/ci/meet-native-policyx.mjs'], closure, 'x', [
      'scripts/ci/meet-native-policy.mjs',
    ]),
    false
  );
});

const env = {
  SOURCE_SHA: source,
  GITHUB_SHA: source,
  EXPECTED_SOURCE_SHA: source,
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_RUN_ID: '10',
  GITHUB_RUN_ATTEMPT: '1',
  GH_TOKEN: 'disposable-test-token',
  MEET_PRODUCTION: 'true',
};

const executedJobs = {
  'type-check.yaml': [
    job('Type Check', 'success', [
      { name: 'Run type check', conclusion: 'success' },
    ]),
  ],
  'turbo-unit-tests.yaml': [
    job('Root script tests (24)'),
    ...[0, 1, 2, 3].map((n) => job(`Unit test shard (${n})`)),
  ],
  'oxc-check.yaml': [job('Oxlint Lint Check'), job('Oxfmt Format Check')],
};

function admission({ red, nearDiff, grep = '', skippedChecks = false }) {
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url);
    const parsed = new URL(url);
    let body;
    if (parsed.origin !== 'https://api.github.com')
      body = {
        appName: 'meet',
        environment: 'production',
        refName: 'production',
        commitHash: live,
      };
    else {
      const workflow = parsed.pathname.split('/').at(-2);
      if (parsed.pathname.endsWith('/jobs')) {
        // Each workflow's evidence reads only its own job names.
        const jobs = skippedChecks
          ? [
              job('Type Check', 'success', [
                { name: 'Run type check', conclusion: 'skipped' },
              ]),
            ]
          : Object.values(executedJobs).flat();
        return { ok: true, text: async () => JSON.stringify({ jobs }) };
      }
      const sha = parsed.searchParams.get('head_sha');
      if (sha === source)
        body = {
          workflow_runs: [
            run(source, red === workflow ? { conclusion: 'failure' } : {}),
          ],
        };
      else if (sha) body = { workflow_runs: [run(sha)] };
      else body = { workflow_runs: [run(near)] };
    }
    return { ok: true, text: async () => JSON.stringify(body) };
  };
  const git = (_bin, args) => {
    if (args[0] === 'rev-parse') return source;
    if (args[0] === 'merge-base') {
      if (args[2] === source && args[3] !== 'FETCH_HEAD')
        throw Object.assign(new Error('no'), { status: 1 });
      return '';
    }
    if (args[0] === 'ls-tree') return [...manifests.keys()].join('\n');
    if (args[0] === 'show')
      return JSON.stringify(
        manifests.get(args[1].slice(41, -'/package.json'.length))
      );
    if (args[0] === 'rev-list') return '3';
    if (args[0] === 'diff') return nearDiff.join('\n');
    if (args[0] === 'grep') {
      if (!grep) throw Object.assign(new Error('none'), { status: 1 });
      return grep;
    }
    return '';
  };
  const receipts = [];
  return {
    receipts,
    urls,
    result: admitRelease({
      env,
      run: git,
      fetcher,
      receipt: (value) => receipts.push(value),
    }),
  };
}

test('Meet admission ignores CodeQL and accepts an equivalent green run for shared checks', async () => {
  const clean = admission({ nearDiff: [] });
  const admitted = await clean.result;
  assert.equal(admitted.guardCode, 'MEET_RELEASE_ADMITTED');
  assert.deepEqual(Object.keys(admitted.checks).sort(), [
    'meet-cloudflare.yaml',
    'oxc-check.yaml',
    'security-checks.yaml',
    'turbo-unit-tests.yaml',
    'type-check.yaml',
  ]);
  assert.ok(clean.urls.every((url) => !url.includes('codeql')));

  const unrelated = admission({
    red: 'type-check.yaml',
    nearDiff: ['apps/web/src/x.ts'],
  });
  const equivalent = await unrelated.result;
  assert.equal(equivalent.checks['type-check.yaml'].equivalentSha, near);
  assert.equal(equivalent.checks['type-check.yaml'].distance, 3);
  // The equivalent commit's own newest run is re-read and must be green.
  assert.ok(
    unrelated.urls.some((url) =>
      url.includes(`type-check.yaml/runs?head_sha=${near}`)
    )
  );

  const related = admission({
    red: 'type-check.yaml',
    nearDiff: ['apps/meet/src/x.ts'],
  });
  await assert.rejects(related.result, /MEET_RELEASE_CI_NOT_GREEN:ci/);
  assert.equal(related.receipts.at(-1).guardCode, 'MEET_RELEASE_CI_NOT_GREEN');

  // A nearby green run that skipped its checks is not evidence.
  const skippedRun = admission({
    red: 'type-check.yaml',
    nearDiff: ['apps/web/src/x.ts'],
    skippedChecks: true,
  });
  await assert.rejects(skippedRun.result, /MEET_RELEASE_CI_NOT_GREEN:ci/);
  assert.ok(
    skippedRun.urls.some((url) => url.endsWith('/attempts/1/jobs?per_page=100'))
  );

  const imported = admission({
    red: 'turbo-unit-tests.yaml',
    nearDiff: ['scripts/ci/meet-native-policy.mjs'],
    grep: `${source}:apps/meet/src/p.test.ts:../../../scripts/ci/meet-native-policy.mjs`,
  });
  await assert.rejects(imported.result, /MEET_RELEASE_CI_NOT_GREEN:ci/);

  for (const exact of ['security-checks.yaml', 'meet-cloudflare.yaml']) {
    const strict = admission({ red: exact, nearDiff: [] });
    await assert.rejects(strict.result, /MEET_RELEASE_CI_NOT_GREEN:ci/, exact);
  }
});
