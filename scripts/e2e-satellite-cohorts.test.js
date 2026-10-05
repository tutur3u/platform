const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  planSatelliteCohorts,
  parseDiscoveryOutput,
  cohortArgs,
  isolationArgs,
  runSatelliteCohorts,
} = require('./e2e-satellite-cohorts');

const lines = [
  '[setup] › e2e/auth.setup.ts:1:1 › authenticate',
  '[chromium-no-auth] › e2e/finance-permission-boundaries.noauth.spec.ts:2:1 › finance',
  '[chromium-no-auth] › e2e/forms-private.noauth.spec.ts:3:1 › forms',
  '[chromium-no-auth] › e2e/lettin-wiki.noauth.spec.ts:4:1 › wiki',
  '[chromium-no-auth] › e2e/workspace-invite-account-shapes.noauth.spec.ts:5:1 › multiple apps',
];

test('manifest partitions every selected test exactly once and retains multi-app dependencies', () => {
  const cohorts = planSatelliteCohorts(
    `Listing tests:\n${lines.join('\n')}\nTotal: 5 tests in 5 files`
  );
  assert.deepEqual(cohorts.flatMap((c) => c.rows).sort(), [...lines].sort());
  assert.deepEqual(cohorts[0].satellites, []);
  assert.deepEqual(
    cohorts.at(-1).satellites.map((s) => s.appName),
    ['contacts', 'finance']
  );
  assert.throws(() => planSatelliteCohorts('unreadable'), /Unreadable/);
});

test('cohort manifest owns selection while execution retries and repeats remain unchanged', () => {
  const args = [
    '--shard',
    '2/4',
    '--project=chromium',
    '--grep',
    'selected',
    '--retries=2',
    '--repeat-each=2',
    '--test-list=original',
    '--output',
    'original',
  ];
  assert.deepEqual(cohortArgs(args, 'manifest', 'output'), [
    '--retries=2',
    '--repeat-each=2',
    '--no-deps',
    '--test-list',
    'manifest',
    '--output',
    'output',
  ]);
});

function root(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-cohorts-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const webDir = path.join(temp, 'apps/web');
  fs.mkdirSync(webDir, { recursive: true });
  return fs.realpathSync(webDir);
}

test('test failures still run remaining cohorts, cleanup occurs before next start, and reports survive', async (t) => {
  const webDir = root(t);
  const events = [];
  let index = 0;
  const failure = new Error('test failed');
  const result = await runSatelliteCohorts({
    cohorts: planSatelliteCohorts(lines.join('\n')),
    args: ['--shard=1/1'],
    env: {},
    webDir,
    start: async (_c, _e, runtime) => {
      runtime.index = index++;
      events.push(`start${runtime.index}`);
    },
    run: async (_args, env) => {
      const row = lines[index - 1];
      const [, projectName, file, line, column, title] = row.match(
        /^\[([^\]]+)\] › (.+):(\d+):(\d+) › (.+)$/
      );
      fs.mkdirSync(env.PLAYWRIGHT_BLOB_OUTPUT_DIR);
      fs.writeFileSync(
        path.join(env.PLAYWRIGHT_BLOB_OUTPUT_DIR, 'report.zip'),
        'report'
      );
      fs.writeFileSync(
        env.PLAYWRIGHT_JSON_OUTPUT_FILE,
        JSON.stringify({
          stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
          suites: [
            {
              specs: [
                {
                  file,
                  line: Number(line),
                  column: Number(column),
                  title,
                  tests: [{ projectName }],
                },
              ],
            },
          ],
        })
      );
      if (index === 2) throw failure;
    },
    diagnose: async () => events.push('diagnose'),
    stop: async (runtime) => events.push(`stop${runtime.index}`),
  });
  assert.equal(result.firstFailure, failure);
  assert.equal(fs.readdirSync(result.blobs).length, 5);
  assert.deepEqual(events, [
    'start0',
    'stop0',
    'start1',
    'diagnose',
    'stop1',
    'start2',
    'stop2',
    'start3',
    'stop3',
    'start4',
    'stop4',
  ]);
});

test('partial startup and cleanup failures stop safely without starting another group', async (t) => {
  const webDir = root(t);
  const runtimeFailure = new Error('cleanup failed');
  const primaryFailure = new Error('startup failed');
  let starts = 0;
  let stops = 0;
  await assert.rejects(
    runSatelliteCohorts({
      cohorts: planSatelliteCohorts(lines.join('\n')),
      args: [],
      env: {},
      webDir,
      start: async (_c, _e, runtime) => {
        starts++;
        runtime.owned.push('partial');
        throw primaryFailure;
      },
      run: async () => assert.fail('must not run'),
      diagnose: async () => {},
      stop: async (runtime) => {
        stops++;
        assert.deepEqual(runtime.owned, ['partial']);
        throw runtimeFailure;
      },
    }),
    (error) => error === primaryFailure
  );
  assert.equal(starts, 1);
  assert.equal(stops, 1);
});

test('public Playwright sharded manifest and isolated runs retain all selected cases and merged JSON', async (t) => {
  const webDir = root(t);
  const api = require.resolve('@playwright/test');
  const cli = require.resolve('@playwright/test/cli');
  const config = path.join(webDir, 'playwright.config.cjs');
  fs.writeFileSync(
    config,
    'module.exports={testDir:".",workers:1,fullyParallel:false,projects:[{name:"setup",testMatch:/setup.spec.ts/},{name:"cases",testIgnore:/setup.spec.ts/,dependencies:["setup"]}]};'
  );
  fs.writeFileSync(
    path.join(webDir, 'setup.spec.ts'),
    `const {test,expect}=require(${JSON.stringify(api)});test('authenticate',()=>expect(1).toBe(1));`
  );
  const names = [
    'finance-permission-boundaries.noauth.spec.ts',
    'forms-private.noauth.spec.ts',
    'lettin-wiki.noauth.spec.ts',
    'workspace-invite-account-shapes.noauth.spec.ts',
  ];
  names.forEach((name, index) => {
    fs.writeFileSync(
      path.join(webDir, name),
      `const {test,expect}=require(${JSON.stringify(api)});test('case${index}',()=>expect(1).toBe(1));`
    );
  });
  const invoke = (args, env = {}) => {
    const result = spawnSync(
      process.execPath,
      [cli, 'test', '--config', config, ...args],
      { cwd: webDir, env: { ...process.env, ...env }, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout;
  };
  const args = [
    '--shard=1/2',
    '--project=cases',
    '--grep=case',
    '--reporter=list,blob,json',
  ];
  const list = parseDiscoveryOutput(
    invoke(
      [
        ...args,
        '--list',
        `--reporter=json,${require.resolve('./e2e-config-reporter')}`,
      ],
      {
        PLAYWRIGHT_JSON_OUTPUT_FILE: '',
      }
    )
  );
  const cohorts = planSatelliteCohorts(list);
  assert.equal(cohorts.flatMap((c) => c.rows).length, 3);
  assert.ok(
    cohorts.flatMap((c) => c.rows).some((row) => /authenticate/.test(row))
  );
  assert.equal(cohorts.length, 1);
  assert.equal(cohorts[0].dependencies, true);
  const result = await runSatelliteCohorts({
    cohorts,
    args,
    env: {},
    webDir,
    start: async () => {},
    stop: async () => {},
    diagnose: async () => {},
    run: async (selected, env) => {
      invoke(selected, env);
    },
  });
  const jsonFile = path.join(webDir, 'merged.json');
  const merged = spawnSync(
    process.execPath,
    [cli, 'merge-reports', '--reporter=json', result.blobs],
    {
      cwd: webDir,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonFile },
      encoding: 'utf8',
    }
  );
  assert.equal(merged.status, 0, merged.stderr);
  const report = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  assert.equal(report.stats.expected, 3, JSON.stringify(report));
  assert.equal(report.stats.unexpected, 0);
});

test('finite invocation policies retain single execution and JSON reporter gains blob without losing original reporters', () => {
  for (const args of [
    ['--global-timeout=100'],
    ['--max-failures', '1'],
    ['-x'],
    ['--repeat-each=2'],
  ]) {
    assert.equal(isolationArgs([...args, '--reporter=line,json']), null);
  }
  assert.equal(isolationArgs(['--reporter=line']), null);
  assert.deepEqual(isolationArgs(['--reporter', 'line,html,json']), [
    '--reporter',
    'line,html,json,blob',
  ]);
  assert.deepEqual(
    isolationArgs(['--reporter=line,blob,json', '--retries=2']),
    ['--reporter=line,blob,json', '--retries=2']
  );
});

test('public project dependencies skip dependent bodies after failed setup while independent cohorts run and remain red', async (t) => {
  const webDir = root(t);
  const api = require.resolve('@playwright/test');
  const cli = require.resolve('@playwright/test/cli');
  const reporter = require.resolve('./e2e-config-reporter');
  const config = path.join(webDir, 'playwright.config.cjs');
  fs.writeFileSync(
    config,
    'module.exports={testDir:".",workers:1,retries:0,projects:[{name:"setup",testMatch:/setup.spec.ts/},{name:"dependent",testMatch:/finance-permission-boundaries.noauth.spec.ts/,dependencies:["setup"]},{name:"independent",testMatch:/forms-private.noauth.spec.ts/}]};'
  );
  fs.writeFileSync(
    path.join(webDir, 'setup.spec.ts'),
    `const {test,expect}=require(${JSON.stringify(api)});test('setup fails',()=>expect(1).toBe(2));`
  );
  fs.writeFileSync(
    path.join(webDir, 'finance-permission-boundaries.noauth.spec.ts'),
    `const {test}=require(${JSON.stringify(api)});test('dependent body',()=>require('node:fs').writeFileSync(${JSON.stringify(path.join(webDir, 'dependent-ran'))},'unsafe'));`
  );
  fs.writeFileSync(
    path.join(webDir, 'forms-private.noauth.spec.ts'),
    `const {test}=require(${JSON.stringify(api)});test('independent body',()=>require('node:fs').writeFileSync(${JSON.stringify(path.join(webDir, 'independent-ran'))},'ran'));`
  );
  const invoke = (args, env = {}) =>
    spawnSync(process.execPath, [cli, 'test', '--config', config, ...args], {
      cwd: webDir,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
  const discovery = invoke(['--list', `--reporter=json,${reporter}`], {
    PLAYWRIGHT_JSON_OUTPUT_FILE: '',
  });
  assert.equal(discovery.status, 0, discovery.stderr);
  const list = parseDiscoveryOutput(discovery.stdout);
  const cohorts = planSatelliteCohorts(list);
  assert.equal(cohorts.length, 2);
  const result = await runSatelliteCohorts({
    cohorts,
    args: ['--reporter=blob,json'],
    env: {},
    webDir,
    start: async () => {},
    stop: async () => {},
    diagnose: async () => {},
    run: async (args, env) => {
      const run = invoke(args, env);
      if (run.status !== 0) throw new Error('selected tests failed');
    },
  });
  assert.match(result.firstFailure.message, /selected tests failed/);
  assert.equal(fs.existsSync(path.join(webDir, 'dependent-ran')), false);
  assert.equal(fs.existsSync(path.join(webDir, 'independent-ran')), true);
  const merged = spawnSync(
    process.execPath,
    [cli, 'merge-reports', '--reporter=json', result.blobs],
    {
      cwd: webDir,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: '' },
      encoding: 'utf8',
    }
  );
  const receipt = JSON.parse(merged.stdout);
  assert.equal(receipt.stats.unexpected, 1);
  assert.equal(receipt.stats.skipped, 1);
  assert.equal(receipt.stats.expected, 1);
});

test('configured finite policies, missing graph, teardown, and stateful/unknown selectors retain the original invocation', () => {
  const graph = {
    globalTimeout: 0,
    maxFailures: 0,
    projects: [
      { name: 'cases', dependencies: [], teardown: null, repeatEach: 1 },
    ],
  };
  const report = (value) => JSON.stringify({ dependencyGraph: value });
  assert.deepEqual(isolationArgs(['--reporter=line,json'], report(graph)), [
    '--reporter=line,json,blob',
  ]);
  for (const value of [
    undefined,
    { ...graph, globalTimeout: 100 },
    { ...graph, maxFailures: 1 },
    { ...graph, projects: [{ ...graph.projects[0], repeatEach: 2 }] },
    { ...graph, projects: [{ ...graph.projects[0], teardown: 'cleanup' }] },
    {
      ...graph,
      projects: [{ ...graph.projects[0], dependencies: ['unknown'] }],
    },
  ]) {
    assert.equal(isolationArgs(['--reporter=line,json'], report(value)), null);
  }
  for (const selector of [
    '--last-failed',
    '--last-failed-file=state.json',
    '--only-changed=main',
    '--unknown-selection',
    '--no-deps',
  ]) {
    assert.equal(
      isolationArgs([selector, '--reporter=line,json'], report(graph)),
      null
    );
  }
});

test('same-count receipt substitution fails completeness instead of returning green', async (t) => {
  const webDir = root(t);
  const result = await runSatelliteCohorts({
    cohorts: planSatelliteCohorts(lines[0]),
    args: [],
    env: {},
    webDir,
    start: async () => {},
    stop: async () => {},
    diagnose: async () => {},
    run: async (_args, env) => {
      fs.mkdirSync(env.PLAYWRIGHT_BLOB_OUTPUT_DIR);
      fs.writeFileSync(
        path.join(env.PLAYWRIGHT_BLOB_OUTPUT_DIR, 'report.zip'),
        'report'
      );
      fs.writeFileSync(
        env.PLAYWRIGHT_JSON_OUTPUT_FILE,
        JSON.stringify({
          stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
          suites: [
            {
              specs: [
                {
                  file: 'substituted.spec.ts',
                  line: 1,
                  column: 1,
                  title: 'substitution',
                  tests: [{ projectName: 'setup' }],
                },
              ],
            },
          ],
        })
      );
    },
  });
  assert.match(result.firstFailure.message, /did not cover/);
});

test('public config discovery preserves finite configured policies before choosing isolation', (t) => {
  const webDir = root(t);
  const api = require.resolve('@playwright/test');
  const cli = require.resolve('@playwright/test/cli');
  const reporter = require.resolve('./e2e-config-reporter');
  const config = path.join(webDir, 'playwright.config.cjs');
  fs.writeFileSync(
    path.join(webDir, 'cases.spec.ts'),
    `const {test}=require(${JSON.stringify(api)});test('case',()=>{});`
  );
  for (const policy of [
    { globalTimeout: 1000 },
    { maxFailures: 2 },
    { repeatEach: 2 },
  ]) {
    fs.writeFileSync(
      config,
      `module.exports=${JSON.stringify({ testDir: '.', projects: [{ name: 'cases' }], ...policy })};`
    );
    const discovery = spawnSync(
      process.execPath,
      [
        cli,
        'test',
        '--config',
        config,
        '--list',
        `--reporter=json,${reporter}`,
      ],
      {
        cwd: webDir,
        env: {
          ...process.env,
          PLAYWRIGHT_JSON_OUTPUT_FILE: '',
          PLAYWRIGHT_JSON_OUTPUT_DIR: '',
          PLAYWRIGHT_JSON_OUTPUT_NAME: '',
        },
        encoding: 'utf8',
      }
    );
    assert.equal(discovery.status, 0, discovery.stderr);
    const list = parseDiscoveryOutput(discovery.stdout);
    const graph = JSON.parse(list).dependencyGraph;
    for (const [key, value] of Object.entries(policy))
      assert.equal(
        key === 'repeatEach' ? graph.projects[0][key] : graph[key],
        value
      );
    assert.equal(isolationArgs(['--reporter=line,json'], list), null);
  }
});
