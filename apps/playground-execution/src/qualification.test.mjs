import assert from 'node:assert/strict';
import test from 'node:test';
import './worker-test-runtime.mjs';

const { default: worker } = await import('./worker.ts');
const { PlaygroundQualifier } = await import('./qualifier.ts');

const OPERATOR = 'o'.repeat(40);
const IMAGE = `registry.cloudflare.com/${'a'.repeat(32)}/tuturuuu-playground@sha256:${'b'.repeat(64)}`;

async function config(environment) {
  const previous = { ...process.env };
  try {
    delete process.env.PLAYGROUND_DEPLOY_ENV;
    if (environment) process.env.PLAYGROUND_DEPLOY_ENV = environment;
    process.env.PLAYGROUND_IMAGE = IMAGE;
    const url = new URL('../cloudflare.config.ts', import.meta.url);
    url.search = `?${environment ?? 'production'}`;
    return (await import(url.href)).default;
  } finally {
    process.env = previous;
  }
}

test('production config has no qualification route, binding, class or workers.dev', async () => {
  const production = await config();
  const text = JSON.stringify(production);
  assert.equal(production.worker.workersDev, false);
  assert.equal(production.worker.previewUrls, false);
  assert.equal('PLAYGROUND_QUALIFY' in production.worker.env, false);
  assert.equal('PLAYGROUND_QUALIFIER' in production.worker.env, false);
  assert.equal('PlaygroundQualifier' in production.worker.exports, false);
  assert.equal(text.includes('qualifier'), false);
  assert.deepEqual(
    production.containers.map(({ name }) => name),
    [
      'tuturuuu-playground-execution-slot',
      'tuturuuu-playground-execution-checker',
    ]
  );
});

test('staging config adds only the qualifier and workers.dev, all pinned to the image', async () => {
  const staging = await config('staging');
  assert.equal(staging.worker.name, 'tuturuuu-playground-execution-staging');
  assert.equal(staging.worker.workersDev, true);
  assert.equal(staging.worker.previewUrls, false);
  assert.ok('PLAYGROUND_QUALIFIER' in staging.worker.env);
  assert.ok('PlaygroundQualifier' in staging.worker.exports);
  for (const container of staging.containers) {
    assert.equal(container.ssh.enabled, false);
    assert.equal(container.images.toolchain.reference, IMAGE);
  }
  const qualifier = staging.containers.find(({ name }) =>
    name.endsWith('-qualifier')
  );
  assert.equal(qualifier.maxInstances, 1);
});

function qualifyRequest(secret = OPERATOR, method = 'POST') {
  return new Request('https://execution.example/qualify', {
    method,
    headers: { Authorization: `Bearer ${secret}` },
  });
}

test('the qualify route is absent unless staging enables it, and needs the operator secret', async () => {
  const calls = [];
  const qualifier = {
    getByName: () => ({
      qualify: async () => {
        calls.push('qualify');
        return { passed: true, cases: [] };
      },
    }),
  };
  const base = {
    PLAYGROUND_OPERATOR_SECRET: OPERATOR,
    PLAYGROUND_INGRESS_SECRET: 'i'.repeat(40),
  };
  for (const env of [
    base,
    { ...base, PLAYGROUND_QUALIFY: 'enabled' },
    { ...base, PLAYGROUND_QUALIFIER: qualifier },
  ]) {
    assert.equal((await worker.fetch(qualifyRequest(), env)).status, 404);
  }
  const enabled = {
    ...base,
    PLAYGROUND_QUALIFY: 'enabled',
    PLAYGROUND_QUALIFIER: qualifier,
  };
  assert.equal(
    (await worker.fetch(qualifyRequest('i'.repeat(40)), enabled)).status,
    401
  );
  assert.equal(
    (await worker.fetch(qualifyRequest(OPERATOR, 'GET'), enabled)).status,
    404
  );
  assert.deepEqual(calls, []);
  const response = await worker.fetch(qualifyRequest(), enabled);
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['qualify']);
});

function guest(results) {
  const execs = [];
  const container = {
    running: false,
    images: { toolchain: 'fixture-digest' },
    destroyed: 0,
    start(options) {
      assert.deepEqual(options, {
        image: 'fixture-digest',
        enableInternet: false,
        instance: 'standard-1',
      });
      this.running = true;
    },
    async destroy() {
      this.destroyed += 1;
      this.running = false;
    },
    async exec(command, options) {
      const job = options.stdin
        ? await new Response(options.stdin).json()
        : undefined;
      execs.push({ command, user: options.user, job });
      const output = job
        ? JSON.stringify(results(job))
        : 'uid=0(root)\nlandlock\n';
      return {
        stdout: new Blob([output]).stream(),
        exitCode: Promise.resolve(0),
      };
    },
  };
  return { container, execs };
}

test('qualification runs only fixed jobs in one fresh guest and destroys it', async () => {
  const { container, execs } = guest(() => ({
    exitCode: 1,
    output: 'nope',
    outcome: 'exited',
    files: null,
  }));
  container.running = true;
  const report = await new PlaygroundQualifier(
    { container, storage: {} },
    {}
  ).qualify();
  assert.equal(report.passed, false);
  assert.equal(report.stopped, true);
  assert.equal(container.running, false);
  // A guest left from an earlier attempt is replaced, then the new one ends.
  assert.equal(container.destroyed, 2);
  assert.match(report.guest, /landlock/);
  assert.equal(execs[0].job, undefined);
  for (const { command, user, job } of execs.slice(1)) {
    assert.equal(user, '0:0');
    assert.equal(command.at(-1), '/usr/local/lib/playground/run.py');
    assert.ok(job.command || job.mode === 'check');
  }
  const names = report.cases.map(({ name }) => name);
  for (const name of [
    'template:python',
    'template:rust',
    'stdin',
    'identity',
    'egress',
    'writes',
    'timeout',
    'output-limit',
    'process-limit',
    'check:java',
  ])
    assert.ok(names.includes(name), name);
});

test('qualification passes only when every case passes', async () => {
  const { container } = guest((job) => {
    if (job.mode === 'check')
      return {
        exitCode: 1,
        outcome: 'exited',
        output: "'y' undeclared nope incompatible types",
      };
    const source = job.files?.[0]?.content ?? '';
    if (job.command === 'yes')
      return { exitCode: 125, outcome: 'output_limit', output: 'y\n' };
    if (source.includes('time.sleep(120)'))
      return { exitCode: 124, outcome: 'timeout', output: '' };
    if (source.includes('input()'))
      return { exitCode: 0, outcome: 'exited', output: 'world\n' };
    if (source.includes('CapInh'))
      return {
        exitCode: 0,
        outcome: 'exited',
        output: '65534 65534 [] [0, 0, 0, 0, 0] 1\n',
      };
    if (source.includes('socket'))
      return { exitCode: 0, outcome: 'exited', output: 'reached []\n' };
    if (source.includes('denied'))
      return {
        exitCode: 0,
        outcome: 'exited',
        output: '5\n',
        files: [{ path: 'out.txt', content: 'kept\n' }],
      };
    if (source.includes('os.fork'))
      return { exitCode: 0, outcome: 'exited', output: 'True\n' };
    return { exitCode: 0, outcome: 'exited', output: 'Hello, playground!\n' };
  });
  const report = await new PlaygroundQualifier(
    { container, storage: {} },
    {}
  ).qualify();
  assert.deepEqual(
    report.cases.filter(({ passed }) => !passed).map(({ name }) => name),
    []
  );
  assert.equal(report.passed, true);
});

test('a second qualification while one runs is refused, not stacked', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { container } = guest(() => ({
    exitCode: 0,
    output: '',
    outcome: 'exited',
  }));
  const exec = container.exec.bind(container);
  let first = true;
  container.exec = async (...args) => {
    if (first) {
      first = false;
      await gate;
    }
    return exec(...args);
  };
  const qualifier = new PlaygroundQualifier({ container, storage: {} }, {});
  const running = qualifier.qualify();
  assert.equal(await qualifier.qualify(), null);
  release();
  assert.ok(await running);
  const response = await worker.fetch(qualifyRequest(), {
    PLAYGROUND_OPERATOR_SECRET: OPERATOR,
    PLAYGROUND_QUALIFY: 'enabled',
    PLAYGROUND_QUALIFIER: { getByName: () => ({ qualify: async () => null }) },
  });
  assert.equal(response.status, 409);
});
