import assert from 'node:assert/strict';
import test from 'node:test';
import './worker-test-runtime.mjs';

const { PlaygroundChecker } = await import('./checker.ts');

const job = {
  requester: 'user-1',
  admittedAt: 0,
  language: 'c',
  files: [
    { path: 'main.c', content: 'int main(void) { return y; }\n' },
    { path: 'lib.h', content: '' },
  ],
};
const diagnosticOutput = "./main.c:1:25: error: 'y' undeclared";

function guest({ output = diagnosticOutput, outcome = 'exited' } = {}) {
  const calls = { start: [], exec: [], destroy: 0, kill: 0, idle: [] };
  const pending = [];
  const container = {
    running: false,
    images: { toolchain: 'fixture-digest' },
    hold: false,
    start(options) {
      calls.start.push(options);
      this.running = true;
    },
    async setInactivityTimeout(duration) {
      calls.idle.push(duration);
    },
    async exec(args, options) {
      const held = this.hold;
      const input = await new Response(options.stdin).json();
      calls.exec.push({ args, user: options.user, input });
      let release;
      const done = new Promise((resolve, reject) => {
        release = resolve;
        if (options.signal?.aborted) reject(new Error('aborted'));
        options.signal?.addEventListener('abort', () =>
          reject(new Error('aborted'))
        );
      });
      if (!held) release();
      else pending.push(release);
      await done;
      return {
        stdout: new Blob([
          JSON.stringify({ exitCode: 1, output, outcome, files: null }),
        ]).stream(),
        exitCode: Promise.resolve(0),
        kill() {
          calls.kill += 1;
        },
      };
    },
    async destroy() {
      calls.destroy += 1;
      this.running = false;
    },
  };
  return { container, calls, pending };
}

function checker(container, now) {
  const values = new Map();
  const alarms = [];
  const storage = {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
    async setAlarm(at) {
      alarms.push(at);
      values.set('alarm', at);
    },
    async deleteAlarm() {
      values.delete('alarm');
    },
  };
  const originalNow = Date.now;
  if (now) Date.now = now;
  const object = new PlaygroundChecker({ storage, container }, {});
  return { object, values, alarms, restore: () => (Date.now = originalNow) };
}

test('a cold room starts one small offline guest and asks the client to retry', async () => {
  const fx = guest();
  const { object } = checker(fx.container);
  assert.deepEqual(await object.check(job), {
    kind: 'refused',
    reason: 'check_warming',
  });
  assert.deepEqual(fx.calls.start, [
    { image: 'fixture-digest', enableInternet: false, instance: 'basic' },
  ]);
  assert.deepEqual(fx.calls.idle, [90_000]);
  assert.equal(fx.calls.exec.length, 0);

  const result = await object.check(job);
  assert.equal(result.kind, 'checked');
  assert.deepEqual(result.diagnostics, [
    {
      path: 'main.c',
      line: 1,
      column: 25,
      severity: 'error',
      message: "'y' undeclared",
      source: 'gcc',
    },
  ]);
  assert.equal(fx.calls.start.length, 1);
  const [{ args, user, input }] = fx.calls.exec;
  assert.equal(user, '0:0');
  assert.equal(args.at(-1), '/usr/local/lib/playground/run.py');
  // The guest receives a server-chosen check job, never a command.
  assert.deepEqual(input, {
    mode: 'check',
    language: 'c',
    files: job.files,
    sources: ['main.c'],
  });
});

test('a newer check from the same person supersedes the one in flight', async () => {
  const fx = guest();
  fx.container.running = true;
  const { object, values } = checker(fx.container);
  values.set('startedAt', Date.now());
  fx.container.hold = true;
  const first = object.check(job);
  await new Promise((resolve) => setImmediate(resolve));
  fx.container.hold = false;
  const second = await object.check(job);
  assert.deepEqual(await first, {
    kind: 'refused',
    reason: 'check_superseded',
  });
  assert.equal(second.kind, 'checked');
  assert.equal(fx.calls.exec.length, 2);
});

test('two people in flight make a third person wait', async () => {
  const fx = guest();
  fx.container.running = true;
  const { object, values } = checker(fx.container);
  values.set('startedAt', Date.now());
  fx.container.hold = true;
  const a = object.check({ ...job, requester: 'a' });
  const b = object.check({ ...job, requester: 'b' });
  while (fx.pending.length < 2)
    await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await object.check({ ...job, requester: 'c' }), {
    kind: 'refused',
    reason: 'check_busy',
  });
  for (const release of fx.pending) release();
  assert.equal((await a).kind, 'checked');
  assert.equal((await b).kind, 'checked');
});

test('an idle guest past its lifetime is replaced before the next check', async (t) => {
  const fx = guest();
  fx.container.running = true;
  let now = 1_000_000;
  const { object, values, restore } = checker(fx.container, () => now);
  t.after(restore);
  values.set('startedAt', now);
  now += 30 * 60_000 + 1;
  assert.deepEqual(await object.check(job), {
    kind: 'refused',
    reason: 'check_warming',
  });
  assert.equal(fx.calls.destroy, 1);
  assert.equal(fx.calls.start.length, 1);
  assert.equal(values.get('startedAt'), now);
});

test('a sandbox or timeout failure reports the check service unavailable', async () => {
  for (const outcome of ['sandbox_failed', 'timeout']) {
    const fx = guest({ outcome, output: '' });
    fx.container.running = true;
    const { object, values } = checker(fx.container);
    values.set('startedAt', Date.now() - 60_000);
    assert.deepEqual(await object.check(job), {
      kind: 'refused',
      reason: 'check_unavailable',
    });
  }
});

test('a booting guest that refuses exec asks for a retry, then gives up', async (t) => {
  const fx = guest();
  fx.container.running = true;
  fx.container.exec = async () => {
    throw new Error('container not ready');
  };
  let now = 5_000_000;
  const { object, values, restore } = checker(fx.container, () => now);
  t.after(restore);
  values.set('startedAt', now - 1000);
  assert.equal((await object.check(job)).reason, 'check_warming');
  now += 60_000;
  assert.equal((await object.check(job)).reason, 'check_unavailable');
});

test('an output-limited compiler run reports truncated diagnostics', async () => {
  const fx = guest({ outcome: 'output_limit' });
  fx.container.running = true;
  const { object, values } = checker(fx.container);
  values.set('startedAt', Date.now());
  const result = await object.check(job);
  assert.equal(result.kind, 'checked');
  assert.equal(result.truncated, true);
});

test('a supersede that lands while exec is starting still kills the old compile', async () => {
  const fx = guest();
  fx.container.running = true;
  const { object, values } = checker(fx.container);
  values.set('startedAt', Date.now());
  const exec = fx.container.exec.bind(fx.container);
  let started;
  const starting = new Promise((resolve) => (started = resolve));
  let finish;
  const gate = new Promise((resolve) => (finish = resolve));
  // This exec ignores its signal and resolves only after the supersede.
  fx.container.exec = async (args, options) => {
    fx.container.exec = exec;
    started();
    await gate;
    return exec(args, { ...options, signal: undefined });
  };
  const first = object.check(job);
  await starting;
  const second = object.check(job);
  finish();
  assert.deepEqual(await first, {
    kind: 'refused',
    reason: 'check_superseded',
  });
  assert.equal((await second).kind, 'checked');
  assert.equal(fx.calls.kill, 1);
});

test('the guest lifetime is an alarm that ends checks in flight', async (t) => {
  const fx = guest();
  let now = 2_000_000;
  const { object, values, alarms, restore } = checker(fx.container, () => now);
  t.after(restore);
  assert.equal((await object.check(job)).reason, 'check_warming');
  assert.deepEqual(alarms, [now + 30 * 60_000]);
  fx.container.hold = true;
  const inFlight = object.check(job);
  while (fx.pending.length < 1)
    await new Promise((resolve) => setImmediate(resolve));
  await object.alarm();
  assert.deepEqual(await inFlight, {
    kind: 'refused',
    reason: 'check_superseded',
  });
  assert.equal(fx.container.running, false);
  assert.equal(values.has('startedAt'), false);
  assert.equal(values.has('alarm'), false);
});

test('shutdown confirms the guest stopped', async () => {
  const fx = guest();
  fx.container.running = true;
  const { object } = checker(fx.container);
  assert.equal(await object.shutdown(), true);
  assert.equal(fx.calls.destroy, 1);
  const stuck = guest();
  stuck.container.running = true;
  stuck.container.destroy = async () => {};
  assert.equal(await checker(stuck.container).object.shutdown(), false);
});

test('a pause fences checks admitted before it, even if they arrive later', async () => {
  const fx = guest();
  fx.container.running = true;
  const { object, values } = checker(fx.container);
  values.set('startedAt', Date.now());
  const admittedBefore = Date.now() - 1;
  assert.equal(await object.shutdown(), true);
  assert.deepEqual(await object.check({ ...job, admittedAt: admittedBefore }), {
    kind: 'refused',
    reason: 'check_unavailable',
  });
  assert.equal(fx.calls.start.length, 0);
  const later = await object.check({ ...job, admittedAt: Date.now() + 1 });
  assert.equal(later.reason, 'check_warming');
  assert.equal(fx.calls.start.length, 1);
});

test('the lifetime alarm does not fence later checks', async () => {
  const fx = guest();
  fx.container.running = true;
  const { object, values } = checker(fx.container);
  values.set('startedAt', Date.now());
  await object.alarm();
  assert.equal(values.has('fencedAt'), false);
  assert.equal((await object.check(job)).reason, 'check_warming');
});
