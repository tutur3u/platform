import assert from 'node:assert/strict';
import test from 'node:test';
import { runInFreshContainer } from './container-run.ts';

const input = { command: 'printf hello', files: [], stdin: 'input' };
const result = { exitCode: 0, output: 'hello', outcome: 'exited' };

function containerFixture(overrides = {}) {
  const calls = [];
  const container = {
    running: false,
    images: { toolchain: 'fixture-digest' },
    start(options) {
      calls.push(['start', options]);
      this.running = true;
    },
    async setInactivityTimeout(duration) {
      calls.push(['idle', duration]);
    },
    async exec(args, options) {
      calls.push(['exec', args, options.user]);
      assert.deepEqual(await new Response(options.stdin).json(), input);
      return {
        stdout: new Blob([JSON.stringify(result)]).stream(),
        exitCode: Promise.resolve(0),
      };
    },
    async destroy() {
      calls.push(['destroy']);
      this.running = false;
    },
    ...overrides,
  };
  return { container, calls };
}

test('starts one egress-disabled isolated guest, passes only job bytes, and destroys on success', async () => {
  const { container, calls } = containerFixture();
  assert.deepEqual(
    await runInFreshContainer(container, input, Date.now() + 1000),
    result
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    ['start', 'idle', 'exec', 'destroy']
  );
  assert.deepEqual(calls[0][1], {
    image: 'fixture-digest',
    enableInternet: false,
    instance: 'standard-1',
  });
  assert.equal(calls[1][1], 15_000);
  assert.equal(calls[2][2], '0:0');
  assert.deepEqual(calls[2][1], [
    '/usr/bin/unshare',
    '--mount',
    '--propagation',
    'private',
    '/usr/bin/python3',
    '-I',
    '-S',
    '-B',
    '/usr/local/lib/playground/run.py',
  ]);
  assert.equal(container.running, false);
});

test('refuses to reuse a running guest or start an expired job', async () => {
  const { container, calls } = containerFixture({ running: true });
  await assert.rejects(
    runInFreshContainer(container, input, Date.now() + 1000),
    /slot is not clean/u
  );
  container.running = false;
  await assert.rejects(
    runInFreshContainer(container, input, Date.now()),
    /deadline passed/u
  );
  assert.deepEqual(calls, []);
});

test('a stop during startup destroys the guest and fences a delayed exec', async () => {
  const started = Promise.withResolvers();
  const startup = Promise.withResolvers();
  const { container, calls } = containerFixture({
    setInactivityTimeout() {
      started.resolve();
      return startup.promise;
    },
  });
  const stop = new AbortController();
  const run = runInFreshContainer(
    container,
    input,
    Date.now() + 1000,
    stop.signal
  );
  await started.promise;
  stop.abort();
  await assert.rejects(run, /execution stopped/u);
  startup.resolve();
  await Promise.resolve();
  assert.deepEqual(
    calls.map(([what]) => what),
    ['start', 'destroy']
  );
});

test('destroys guests whose output exceeds the response bound', async () => {
  const { container, calls } = containerFixture({
    async exec() {
      return {
        stdout: new Blob([new Uint8Array(14 * 1024 * 1024 + 1)]).stream(),
        exitCode: Promise.resolve(0),
      };
    },
  });
  await assert.rejects(
    runInFreshContainer(container, input, Date.now() + 1000),
    /output limit/u
  );
  assert.deepEqual(
    calls.map(([what]) => what),
    ['start', 'idle', 'destroy']
  );
});

test('does not report success without confirmed teardown', async () => {
  const { container } = containerFixture({ async destroy() {} });
  await assert.rejects(
    runInFreshContainer(container, input, Date.now() + 1000),
    /teardown unconfirmed/u
  );
});
