import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildPlan,
  changedFiles,
  closureKeys,
  fitBody,
  LIMITS,
  register,
  request,
} from './ci-register.mjs';
import {
  loadMainPushWorkflows,
  parsePushFilters,
  pushSelectsBranch,
} from './pr-blast-radius.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const WORKFLOWS = path.join(ROOT, '.github/workflows');
const SHA = 'a'.repeat(40);
const BEFORE = 'b'.repeat(40);

test('the push filter parser agrees with a YAML parser on every workflow', () => {
  const parsed = JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        `const dir = process.argv[1];
const out = {};
for (const file of require('node:fs').readdirSync(dir).sort()) {
  if (!/\\.ya?ml$/.test(file)) continue;
  const workflow = Bun.YAML.parse(await Bun.file(dir + '/' + file).text());
  out[file] = workflow.on ?? workflow[true] ?? null;
}
console.log(JSON.stringify(out));`,
        WORKFLOWS,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  );
  const files = readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/u.test(file));
  assert.ok(files.length > 100);
  let pushes = 0;
  for (const file of files) {
    const on = parsed[file];
    let push;
    if (typeof on === 'string') push = on === 'push' ? {} : undefined;
    else if (Array.isArray(on)) push = on.includes('push') ? {} : undefined;
    else if (on && Object.hasOwn(on, 'push')) push = on.push ?? {};
    const expected =
      push === undefined
        ? null
        : {
            branches: push.branches ?? null,
            branchesIgnore: push['branches-ignore'] ?? null,
            tags: push.tags ?? null,
            tagsIgnore: push['tags-ignore'] ?? null,
            paths: push.paths ?? null,
            ignore: push['paths-ignore'] ?? null,
          };
    if (expected) pushes += 1;
    assert.deepEqual(
      parsePushFilters(readFileSync(path.join(WORKFLOWS, file), 'utf8')),
      expected,
      file
    );
  }
  assert.ok(pushes > 50);
});

test('push filters resolve aliases, flow lists and scalar triggers', () => {
  const filters = parsePushFilters(`name: x
on:
  pull_request:
    paths: &shared
      - 'apps/lms/**'
      - "bun.lock"
  push:
    branches: [main, 'release/**']
    # comment
    paths: *shared
jobs:
  push:
    runs-on: ubuntu-latest
`);
  assert.deepEqual(filters.paths, ['apps/lms/**', 'bun.lock']);
  assert.deepEqual(filters.branches, ['main', 'release/**']);
  assert.equal(parsePushFilters('on: [pull_request, push]\n').paths, null);
  assert.equal(parsePushFilters('on: pull_request\n'), null);
  assert.equal(
    parsePushFilters('on:\n  workflow_dispatch:\njobs:\n  push:\n'),
    null
  );
});

test('a push to main starts only workflows whose branch filters admit it', () => {
  const branch = (filters) =>
    pushSelectsBranch({
      branches: null,
      branchesIgnore: null,
      tags: null,
      tagsIgnore: null,
      ...filters,
    });
  assert.equal(branch({}), true);
  assert.equal(branch({ branches: ['main'] }), true);
  assert.equal(branch({ branches: ['production'] }), false);
  assert.equal(branch({ branches: ['**'] }), true);
  assert.equal(branch({ branches: ['*', '!main'] }), false);
  assert.equal(branch({ branchesIgnore: ['production'] }), true);
  assert.equal(branch({ branchesIgnore: ['main'] }), false);
  assert.equal(branch({ tags: ['v*'] }), false);
  assert.equal(pushSelectsBranch(null), false);

  const files = loadMainPushWorkflows().map((workflow) => workflow.file);
  assert.ok(files.includes('type-check.yaml'));
  assert.ok(files.includes('e2e-tests.yaml'), 'branches-ignore: production');
  assert.ok(!files.includes('vercel-production.yaml'));
  assert.ok(
    files.length + 1 <= LIMITS.maxPlanEntries,
    'plan fits the registry'
  );
});

test('the changed range is unknown without a usable before commit', () => {
  const git = (args) => {
    assert.deepEqual(args.slice(0, 4), [
      'diff',
      '--name-only',
      '-z',
      '--no-renames',
    ]);
    return 'apps/a.ts\0docs/b.md\0';
  };
  assert.deepEqual(changedFiles(git, BEFORE, SHA), ['apps/a.ts', 'docs/b.md']);
  assert.equal(changedFiles(git, '0'.repeat(40), SHA), null);
  assert.equal(changedFiles(git, null, SHA), null);
  assert.equal(changedFiles(git, 'HEAD~1', SHA), null);
  const broken = () => {
    throw new Error('bad object');
  };
  assert.equal(changedFiles(broken, BEFORE, SHA), null);
});

const WORKFLOW_A = { file: 'a.yaml', paths: ['apps/a/**'], ignore: [] };
const WORKFLOW_ALL = { file: 'all.yaml', paths: [], ignore: ['**/*.md'] };

test('the plan applies the path filter, then the workflow decision', () => {
  const decided = [];
  const decide = (workflow) => {
    decided.push(workflow);
    return { shouldRun: workflow === 'a.yaml', reason: `${workflow} decided` };
  };
  const workflows = [WORKFLOW_A, WORKFLOW_ALL];
  assert.deepEqual(buildPlan({ workflows, files: ['docs/x.md'], decide }), [
    {
      workflow: 'a.yaml',
      run: false,
      reason: 'no changed path matches the push filter',
    },
    {
      workflow: 'all.yaml',
      run: false,
      reason: 'no changed path matches the push filter',
    },
  ]);
  assert.deepEqual(decided, []);
  const plan = buildPlan({
    workflows,
    files: ['apps/a/x.ts'],
    decide,
    keys: new Map([['a.yaml', 'f'.repeat(32)]]),
  });
  assert.deepEqual(plan, [
    {
      workflow: 'a.yaml',
      run: true,
      reason: 'a.yaml decided',
      closureKey: 'f'.repeat(32),
    },
    { workflow: 'all.yaml', run: false, reason: 'all.yaml decided' },
  ]);
  // An unknown range leaves every path filter open.
  assert.equal(
    buildPlan({ workflows, files: null, decide }).every((entry) =>
      entry.reason.endsWith('decided')
    ),
    true
  );
  const long = buildPlan({
    workflows: [WORKFLOW_A],
    files: null,
    decide: () => ({ shouldRun: true, reason: `line\n${'x'.repeat(200)}` }),
  })[0].reason;
  assert.equal(long.length, LIMITS.reasonLength);
  assert.doesNotMatch(long, /\n/u);
});

test('closure keys change only with the files a filter selects', () => {
  const tree = (oids) => (args) => {
    assert.equal(args[0], 'ls-tree');
    return Object.entries(oids)
      .map(([file, oid]) => `100644 blob ${oid}\t${file}\0`)
      .join('');
  };
  const base = {
    '.github/workflows/a.yaml': '1',
    'apps/a/x.ts': '2',
    'apps/b/y.ts': '3',
    'README.md': '4',
  };
  const keys = (oids) =>
    closureKeys(tree(oids), SHA, [WORKFLOW_A, WORKFLOW_ALL]);
  const first = keys(base);
  assert.match(first.get('a.yaml'), /^[0-9a-f]{32}$/u);
  const otherApp = keys({ ...base, 'apps/b/y.ts': '9' });
  assert.equal(otherApp.get('a.yaml'), first.get('a.yaml'));
  assert.notEqual(otherApp.get('all.yaml'), first.get('all.yaml'));
  const ownFile = keys({ ...base, '.github/workflows/a.yaml': '9' });
  assert.notEqual(ownFile.get('a.yaml'), first.get('a.yaml'));
  const ignored = keys({ ...base, 'README.md': '9' });
  assert.equal(ignored.get('all.yaml'), first.get('all.yaml'));
});

test('the body sheds closure keys, then reason detail, to fit', () => {
  const entry = (index, reason) => ({
    workflow: `workflow-${index}-cloudflare.yaml`,
    run: true,
    reason,
    closureKey: 'f'.repeat(32),
  });
  const body = (count, reason = 'x'.repeat(LIMITS.reasonLength)) => ({
    sha: SHA,
    before: BEFORE,
    base: null,
    plan: Array.from({ length: count }, (_, index) => entry(index, reason)),
  });
  const small = body(5);
  assert.equal(fitBody(small), small);
  const keyless = fitBody(body(70));
  assert.equal(keyless.plan[0].closureKey, undefined);
  assert.equal(keyless.plan[0].reason.length, LIMITS.reasonLength);
  const short = fitBody(body(LIMITS.maxPlanEntries));
  assert.equal(short.plan[0].reason.length, 40);
  assert.ok(Buffer.byteLength(JSON.stringify(short)) <= LIMITS.maxBodyBytes);
  assert.equal(fitBody(body(LIMITS.maxPlanEntries + 1)), null);
});

test('limits mirror the coordinator registry', () => {
  const source = readFileSync(
    path.join(ROOT, 'apps/deploy-coordinator/src/ci-registry.ts'),
    'utf8'
  );
  for (const [name, value] of [
    ['maxPlanEntries', LIMITS.maxPlanEntries],
    ['maxBodyBytes', LIMITS.maxBodyBytes],
    ['reasonLength', LIMITS.reasonLength],
  ])
    assert.match(
      source,
      new RegExp(
        `${name}: ${String(value).replace(/\B(?=(\d{3})+$)/gu, '_')},`
      ),
      name
    );
});

test('requests retry network errors and 5xx only, three times', async () => {
  const slept = [];
  const sleep = async (ms) => slept.push(ms);
  const answers = (statuses) => {
    const calls = [];
    const fetch = async (url) => {
      calls.push(url);
      const status = statuses.shift();
      if (status === 'throw') throw new Error('ECONNRESET');
      return new Response(JSON.stringify({ status }), { status });
    };
    return { fetch, calls };
  };
  let server = answers([503, 'throw', 500]);
  assert.equal((await request(server.fetch, sleep, 'u', {})).status, 500);
  assert.equal(server.calls.length, 3);
  assert.deepEqual(slept, [1_000, 2_000]);
  server = answers([429]);
  assert.equal((await request(server.fetch, sleep, 'u', {})).status, 429);
  assert.equal(server.calls.length, 1);
  server = answers(['throw', 200]);
  assert.equal((await request(server.fetch, sleep, 'u', {})).ok, true);
});

function fakeRegistration(statuses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (new URL(url).origin === 'https://token.test')
      return Response.json({ value: 'oidc-token' });
    const status = statuses.shift() ?? 200;
    return Response.json(status === 200 ? { created: true } : { error: 'X' }, {
      status,
    });
  };
  return { fetch, calls };
}

const registerEnv = (overrides = {}) => ({
  DEPLOY_COORDINATOR_CI_MODE: 'observe',
  DEPLOY_COORDINATOR_ORIGIN: 'https://deploy.test/',
  GITHUB_SHA: SHA,
  GITHUB_EVENT_PATH: '/nonexistent/event.json',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.test/id?x=1',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'bearer',
  ...overrides,
});

// No git history: the range is unknown, so the plan is every workflow's
// own decision. Closure keys fail closed to none.
const noGit = () => {
  throw new Error('no git');
};

test('registers the plan with the OIDC token', async () => {
  const server = fakeRegistration([]);
  const logs = [];
  const result = await register({
    env: registerEnv(),
    fetch: server.fetch,
    sleep: async () => {},
    rootDir: ROOT,
    git: noGit,
    log: (line) => logs.push(line),
  });
  assert.deepEqual(result, { created: true });
  assert.equal(server.calls.length, 2);
  assert.equal(
    server.calls[0].url,
    'https://token.test/id?x=1&audience=tuturuuu-deploy-coordinator'
  );
  const post = server.calls[1];
  assert.equal(post.url, 'https://deploy.test/v1/ci/main/registrations');
  assert.equal(post.init.headers.Authorization, 'Bearer oidc-token');
  const body = JSON.parse(post.init.body);
  assert.equal(body.sha, SHA);
  assert.equal(body.before, null);
  assert.equal(body.base, null);
  assert.ok(body.plan.length > 50);
  assert.ok(!body.plan.some((entry) => entry.workflow === 'ci-register.yaml'));
  assert.ok(Buffer.byteLength(post.init.body) <= LIMITS.maxBodyBytes);
  assert.match(logs.join('\n'), /Registered\./u);
});

test('never throws or posts when off, misconfigured or refused', async () => {
  for (const env of [
    registerEnv({ DEPLOY_COORDINATOR_CI_MODE: 'off' }),
    registerEnv({ DEPLOY_COORDINATOR_CI_MODE: undefined }),
    registerEnv({ DEPLOY_COORDINATOR_ORIGIN: 'http://deploy.test' }),
    registerEnv({ DEPLOY_COORDINATOR_ORIGIN: 'https://deploy.test/path' }),
    registerEnv({ GITHUB_SHA: 'HEAD' }),
  ]) {
    const server = fakeRegistration([]);
    await register({
      env,
      fetch: server.fetch,
      rootDir: ROOT,
      git: noGit,
      log: () => {},
    });
    assert.equal(server.calls.length, 0);
  }
  const noToken = fakeRegistration([]);
  await register({
    env: registerEnv({ ACTIONS_ID_TOKEN_REQUEST_URL: '' }),
    fetch: noToken.fetch,
    rootDir: ROOT,
    git: noGit,
    log: () => {},
  });
  assert.equal(noToken.calls.length, 0);
  const refused = fakeRegistration([503, 503, 503]);
  const logs = [];
  await register({
    env: registerEnv(),
    fetch: refused.fetch,
    sleep: async () => {},
    rootDir: ROOT,
    git: noGit,
    log: (line) => logs.push(line),
  });
  assert.equal(refused.calls.length, 1 + LIMITS.attempts);
  assert.match(logs.join('\n'), /Registration answered 503/u);
});

test('the CLI exits 0 whatever happens', () => {
  for (const mode of ['off', 'observe']) {
    const result = spawnSync(
      process.execPath,
      ['--no-warnings', path.join(ROOT, 'scripts/ci/ci-register.mjs')],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          DEPLOY_COORDINATOR_CI_MODE: mode,
          DEPLOY_COORDINATOR_ORIGIN: 'https://127.0.0.1:9',
          GITHUB_SHA: 'not-a-sha',
        },
        timeout: 60_000,
      }
    );
    assert.equal(result.status, 0, result.stderr);
  }
});
