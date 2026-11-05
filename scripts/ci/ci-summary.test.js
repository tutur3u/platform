const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const { readWorkflow } = require('./workflow-yaml-test-helper');
const {
  CHECK_NAME,
  APP_PERMISSIONS,
  buildCheckRun,
  createAppJwt,
  evaluateHead,
  fnmatch,
  main,
  patternHits,
  readAppCredentials,
  readTriggers,
  workflowExpected,
} = require('./ci-summary');

const root = path.resolve(__dirname, '../..');
const posterPath = path.join(root, '.github/workflows/ci-summary-poster.yml');
const posterSource = fs.readFileSync(posterPath, 'utf8');
const head = 'a'.repeat(40);

function expectedPull(overrides = {}) {
  return {
    baseRef: 'main',
    labels: new Set(),
    files: ['apps/web/src/app/page.tsx'],
    filesTruncated: false,
    ...overrides,
  };
}

function definition(overrides = {}) {
  return {
    id: 42,
    name: 'TypeScript Type Check',
    path: '.github/workflows/type-check.yaml',
    triggers: { pull_request: null },
    unreadable: false,
    ...overrides,
  };
}

function run(overrides = {}) {
  return {
    id: 7,
    name: 'TypeScript Type Check',
    path: '.github/workflows/type-check.yaml',
    workflow_id: 42,
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    ...overrides,
  };
}

test('path globs follow fnmatch and retry a leading **/', () => {
  const cases = [
    ['apps/mobile/lib/a.dart', 'apps/mobile/**', true],
    ['apps/mobile', 'apps/mobile/**', false],
    ['README.md', '**/*.md', true],
    ['docs/README.md', '**/*.md', true],
    [
      'scripts/ci/shortener-native-foo.ts',
      'scripts/ci/shortener-native-*',
      true,
    ],
    ['not-a-match.ts', 'apps/**', false],
  ];
  for (const [name, pattern, expected] of cases) {
    assert.equal(patternHits(name, pattern), expected, `${pattern} ${name}`);
    const python = spawnSync(
      'python3',
      [
        '-c',
        'import fnmatch,sys; pats=[sys.argv[2]];\n' +
          'pats = [sys.argv[2], sys.argv[2][3:]] if sys.argv[2].startswith("**/") else [sys.argv[2]]\n' +
          'print(any(fnmatch.fnmatch(sys.argv[1], p) for p in pats))',
        name,
        pattern,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(python.status, 0, python.stderr);
    assert.equal(patternHits(name, pattern), python.stdout.trim() === 'True');
  }
  assert.equal(fnmatch('docs/README.md', '**/*.md'), true);
  assert.equal(patternHits('README.md', '!**/*.md'), false);
});

test('pull_request filters admit the fail-safe expected set', () => {
  assert.equal(workflowExpected({ pull_request: null }, expectedPull()), true);
  assert.equal(
    workflowExpected({ workflow_dispatch: null }, expectedPull()),
    false
  );
  assert.equal(
    workflowExpected(
      { pull_request: { branches: ['main'] } },
      expectedPull({ baseRef: 'feature' })
    ),
    false
  );
  assert.equal(
    workflowExpected(
      { pull_request: { paths: ['apps/mobile/**'] } },
      expectedPull()
    ),
    false
  );
  assert.equal(
    workflowExpected(
      { pull_request: { paths: ['apps/web/**', '!**/*.md'] } },
      expectedPull({ files: ['apps/web/README.md'] })
    ),
    true,
    'a negated pattern does not hide a positive match'
  );
  assert.equal(
    workflowExpected(
      { pull_request: { types: ['labeled'] } },
      expectedPull({ labels: new Set() })
    ),
    false
  );
  assert.equal(
    workflowExpected(
      { pull_request: { types: ['labeled'] } },
      expectedPull({ labels: new Set(['docs']) })
    ),
    true
  );
  assert.equal(
    workflowExpected(
      { pull_request: { paths: ['apps/mobile/**'] } },
      expectedPull({ filesTruncated: true, files: ['README.md'] })
    ),
    true
  );
  assert.equal(
    workflowExpected(
      { pull_request: { 'paths-ignore': ['**/*.md'] } },
      expectedPull({ files: [] })
    ),
    false
  );
});

test('the summary fails closed on a skipped workflow and waits while work is open', () => {
  const base = {
    draft: false,
    baseRef: 'main',
    labels: [],
    files: ['apps/web/src/app/page.tsx'],
    filesTruncated: false,
    definitions: [definition()],
    checks: [{ name: 'Vercel', status: 'completed', conclusion: 'success' }],
    selfRunId: 99,
    headSha: head,
  };
  const success = buildCheckRun(evaluateHead({ ...base, runs: [run()] }));
  assert.equal(success.conclusion, 'success');
  assert.equal(success.status, 'completed');
  assert.equal(success.name, CHECK_NAME);
  assert.equal(success.head_sha, head);

  const skipped = buildCheckRun(
    evaluateHead({
      ...base,
      runs: [run({ conclusion: 'skipped' })],
    })
  );
  assert.equal(skipped.conclusion, 'failure');
  assert.match(skipped.output.summary, /skipped/);

  const neutralCheck = buildCheckRun(
    evaluateHead({
      ...base,
      runs: [run()],
      checks: [{ name: 'lint', status: 'completed', conclusion: 'neutral' }],
    })
  );
  assert.equal(neutralCheck.conclusion, 'success');

  const badCheck = buildCheckRun(
    evaluateHead({
      ...base,
      runs: [run()],
      checks: [{ name: 'lint', status: 'completed', conclusion: 'failure' }],
    })
  );
  assert.equal(badCheck.conclusion, 'failure');

  const waiting = buildCheckRun(
    evaluateHead({ ...base, draft: true, runs: [run()] })
  );
  assert.equal(waiting.status, 'in_progress');
  assert.equal(waiting.conclusion, undefined);
  assert.match(waiting.output.title, /draft/);

  const missing = buildCheckRun(evaluateHead({ ...base, runs: [] }));
  assert.equal(missing.status, 'in_progress');
  assert.match(missing.output.summary, /TypeScript Type Check/);

  const openRun = buildCheckRun(
    evaluateHead({
      ...base,
      runs: [run({ status: 'in_progress', conclusion: null })],
    })
  );
  assert.equal(openRun.status, 'in_progress');

  const laterAttempt = buildCheckRun(
    evaluateHead({
      ...base,
      runs: [
        run({ id: 1, run_attempt: 1, conclusion: 'failure' }),
        run({ id: 2, run_attempt: 2, conclusion: 'success' }),
      ],
    })
  );
  assert.equal(laterAttempt.conclusion, 'success');

  const selfFailure = buildCheckRun(
    evaluateHead({
      ...base,
      runs: [
        run(),
        run({
          id: 99,
          name: 'CI summary poster',
          path: '.github/workflows/ci-summary-poster.yml',
          workflow_id: 8,
          conclusion: 'failure',
        }),
      ],
    })
  );
  assert.equal(selfFailure.conclusion, 'success');

  const unreadable = buildCheckRun(
    evaluateHead({
      ...base,
      definitions: [definition({ unreadable: true, triggers: null })],
      runs: [],
    })
  );
  assert.equal(unreadable.status, 'in_progress');
  assert.match(unreadable.output.summary, /unreadable/);
});

test('app credentials are refused without the private key', () => {
  assert.throws(
    () => readAppCredentials({ CI_SUMMARY_APP_ID: '123' }),
    /CI_SUMMARY_APP_ID/
  );
  assert.throws(
    () =>
      readAppCredentials({
        CI_SUMMARY_APP_ID: 'abc',
        CI_SUMMARY_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\n',
      }),
    /CI_SUMMARY_APP_ID/
  );
  const key = '-----BEGIN PRIVATE KEY-----\\nline\\n-----END PRIVATE KEY-----';
  assert.match(
    readAppCredentials({
      CI_SUMMARY_APP_ID: '123',
      CI_SUMMARY_APP_PRIVATE_KEY: key,
    }).privateKey,
    /\nline\n/
  );
});

test('the app JWT is an RS256 assertion for the app id', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const now = 1_700_000_000;
  const token = createAppJwt('456', pem, now);
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  assert.equal(
    verifier.verify(publicKey, Buffer.from(signature, 'base64url')),
    true
  );
  assert.deepEqual(JSON.parse(Buffer.from(encodedPayload, 'base64url')), {
    iat: now - 60,
    exp: now + 540,
    iss: '456',
  });
  assert.equal(APP_PERMISSIONS.checks, 'write');
  assert.equal(APP_PERMISSIONS.actions, 'read');
});

function routeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const call = {
      method: options.method,
      path: parsed.pathname,
      search: parsed.search,
      authorization: options.headers?.Authorization,
      body: options.body ? JSON.parse(options.body) : undefined,
    };
    calls.push(call);
    const route = routes.find(
      (item) => item.method === options.method && item.path === parsed.pathname
    );
    if (!route) {
      return {
        ok: false,
        status: 404,
        text: async () =>
          JSON.stringify({ message: `missing ${parsed.pathname}` }),
        headers: { get: () => null },
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(route.body),
      headers: {
        get: (name) => (name === 'link' ? (route.link ?? null) : null),
      },
    };
  };
  return { calls, fetchImpl };
}

const privateKey = crypto
  .generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });

function appEnv(overrides = {}) {
  return {
    CI_SUMMARY_APP_ID: '456',
    CI_SUMMARY_APP_PRIVATE_KEY: privateKey,
    EVENT_NAME: 'pull_request_target',
    PR_NUMBER: '7',
    REPO: 'tutur3u/platform',
    GITHUB_RUN_ID: '99',
    GITHUB_TOKEN: 'workflow-token-sentinel',
    GH_TOKEN: 'workflow-token-sentinel',
    ...overrides,
  };
}

function installedApp(permissions = APP_PERMISSIONS) {
  return [
    {
      method: 'GET',
      path: '/repos/tutur3u/platform/installation',
      body: { id: 9 },
    },
    {
      method: 'POST',
      path: '/app/installations/9/access_tokens',
      body: { token: 'ghs_poster', permissions },
    },
  ];
}

test('missing app credentials post nothing and ignore the workflow token', async () => {
  let called = false;
  await assert.rejects(
    () =>
      main(appEnv({ CI_SUMMARY_APP_PRIVATE_KEY: '' }), {
        fetchImpl: async () => {
          called = true;
          throw new Error('network');
        },
      }),
    /CI_SUMMARY_APP_ID/
  );
  assert.equal(called, false);
});

test('a token without checks write is not used to post', async () => {
  const github = routeFetch(
    installedApp({ ...APP_PERMISSIONS, checks: 'read' })
  );
  await assert.rejects(
    () =>
      main(appEnv(), {
        fetchImpl: github.fetchImpl,
        triggersByPath: new Map(),
      }),
    /checks: write/
  );
  assert.deepEqual(
    github.calls.map((call) => call.path),
    [
      '/repos/tutur3u/platform/installation',
      '/app/installations/9/access_tokens',
    ]
  );
  assert.equal(github.calls[1].body.permissions.checks, 'write');
  for (const call of github.calls) {
    assert.equal(call.authorization.includes('workflow-token-sentinel'), false);
  }
});

test('the poster writes the summary with the app token only', async () => {
  const github = routeFetch([
    ...installedApp(),
    {
      method: 'GET',
      path: '/repos/tutur3u/platform/actions/workflows',
      body: {
        workflows: [
          {
            id: 42,
            name: 'TypeScript Type Check',
            path: '.github/workflows/type-check.yaml',
            state: 'active',
          },
          {
            id: 8,
            name: 'CI summary poster',
            path: '.github/workflows/ci-summary-poster.yml',
            state: 'active',
          },
          {
            id: 3,
            name: 'Old summary',
            path: '.github/workflows/ci-summary.yml',
            state: 'deleted',
          },
        ],
      },
    },
    {
      method: 'GET',
      path: '/repos/tutur3u/platform/pulls/7',
      body: {
        draft: false,
        base: { ref: 'main' },
        head: { sha: head },
        labels: [],
      },
    },
    {
      method: 'GET',
      path: '/repos/tutur3u/platform/pulls/7/files',
      body: [{ filename: 'apps/web/src/app/page.tsx' }],
    },
    {
      method: 'GET',
      path: '/repos/tutur3u/platform/actions/runs',
      body: {
        workflow_runs: [
          run(),
          run({
            id: 99,
            name: 'CI summary poster',
            path: '.github/workflows/ci-summary-poster.yml',
            workflow_id: 8,
            conclusion: 'failure',
          }),
        ],
      },
    },
    {
      method: 'GET',
      path: `/repos/tutur3u/platform/commits/${head}/check-runs`,
      body: {
        check_runs: [
          { name: 'Vercel', status: 'completed', conclusion: 'success' },
          {
            name: 'CI summary (poster)',
            status: 'in_progress',
            conclusion: null,
          },
        ],
      },
    },
    {
      method: 'POST',
      path: '/repos/tutur3u/platform/check-runs',
      body: { id: 1 },
    },
  ]);
  const triggersByPath = new Map([
    ['.github/workflows/type-check.yaml', { pull_request: null }],
    [
      '.github/workflows/ci-summary-poster.yml',
      { pull_request_target: null, schedule: [{ cron: '7,22,37,52 * * * *' }] },
    ],
  ]);
  await main(appEnv(), { fetchImpl: github.fetchImpl, triggersByPath });
  const post = github.calls.find(
    (call) => call.method === 'POST' && call.path.endsWith('/check-runs')
  );
  assert.equal(post.authorization, 'Bearer ghs_poster');
  assert.equal(post.body.conclusion, 'success');
  assert.equal(post.body.head_sha, head);
  for (const call of github.calls) {
    assert.equal(call.authorization.includes('workflow-token-sentinel'), false);
  }
});

test('a schedule with no open pull requests posts nothing', async () => {
  const github = routeFetch([
    ...installedApp(),
    {
      method: 'GET',
      path: '/repos/tutur3u/platform/pulls',
      body: [],
    },
  ]);
  await main(appEnv({ EVENT_NAME: 'schedule', PR_NUMBER: '' }), {
    fetchImpl: github.fetchImpl,
    triggersByPath: new Map([
      ['.github/workflows/type-check.yaml', { pull_request: null }],
    ]),
  });
  assert.equal(
    github.calls.some((call) => call.path.endsWith('/check-runs')),
    false
  );
});

test('an empty workflow checkout refuses to post', () => {
  const dir = fs.mkdtempSync(
    path.join(require('node:os').tmpdir(), 'ci-summary-')
  );
  try {
    assert.throws(() => readTriggers(dir, () => ({})), /No workflow files/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the poster workflow is read-only and is not a workflow_run consumer', () => {
  assert.equal(
    fs.existsSync(path.join(root, '.github/workflows/ci-summary.yml')),
    false
  );
  const workflow = readWorkflow('ci-summary-poster.yml');
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    'pull_request_target',
    'schedule',
  ]);
  assert.equal(workflow.on.workflow_run, undefined);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions.checks, undefined);
  assert.deepEqual(workflow.jobs.summary.permissions, { contents: 'read' });
  assert.equal(
    workflow.jobs.summary.steps.at(-1).env.CI_SUMMARY_APP_ID,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
    '${{ secrets.CI_SUMMARY_APP_ID }}'
  );
  assert.match(posterSource, /unset GITHUB_TOKEN GH_TOKEN/);
  assert.doesNotMatch(
    posterSource,
    /github\.token|secrets\.GITHUB_TOKEN|checks:\s*['"]?write|workflow_run:/
  );
  assert.equal(
    workflow.jobs.summary.steps[0].with['persist-credentials'],
    false
  );
  assert.match(
    String(workflow.jobs.summary.steps[0].with.ref),
    /default_branch/
  );
  assert.equal(workflow.on.schedule[0].cron, '7,22,37,52 * * * *');
  const source = fs.readFileSync(path.join(__dirname, 'ci-summary.js'), 'utf8');
  assert.doesNotMatch(source, /GITHUB_TOKEN|GH_TOKEN|github\.token/);
});
