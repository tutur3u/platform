import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// The slot imports the Workers runtime base class and a workspace type module
// whose package entry points at build output. Serve both from source so the
// test exercises the real slot without a build.
const typesSource = new URL(
  '../../../packages/types/src/primitives/playgrounds.ts',
  import.meta.url
).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return {
        url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}',
        shortCircuit: true,
      };
    }
    if (specifier === '@tuturuuu/types/primitives/playgrounds') {
      return { url: typesSource, shortCircuit: true };
    }
    // Worker sources use bundler-style extensionless relative imports.
    if (specifier.startsWith('./') && !/\.[cm]?[jt]s$/u.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});
const { PlaygroundSlot } = await import('./slot.ts');

const PROJECT = '7d0f9e5c-3f4b-4c1e-9a55-0f1d2e3c4b5a';
const OWNER = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';
const MEETING = '2c3d4e5f-6071-4829-9bac-1d2e3f4a5b6c';
const files = [{ path: 'main.py', content: 'print("hi")\n' }];
const job = {
  projectId: PROJECT,
  revision: 3,
  language: 'python',
  operation: 'run',
  files,
  command: 'python3 main.py',
};

function storageFixture() {
  const values = new Map();
  const counts = { put: 0, delete: 0, setAlarm: 0, deleteAlarm: 0 };
  let alarm = null;
  const writer = {
    async put(key, value) {
      counts.put += 1;
      values.set(key, structuredClone(value));
    },
    async delete(keys) {
      counts.delete += 1;
      for (const key of [keys].flat()) values.delete(key);
    },
    async setAlarm(at) {
      counts.setAlarm += 1;
      alarm = at;
    },
    async deleteAlarm() {
      counts.deleteAlarm += 1;
      alarm = null;
    },
  };
  return {
    values,
    counts,
    alarm: () => alarm,
    storage: {
      ...writer,
      async get(key) {
        return values.has(key) ? structuredClone(values.get(key)) : undefined;
      },
      async transaction(callback) {
        return callback(writer);
      },
    },
  };
}

function containerFixture() {
  const calls = { start: 0, exec: 0, destroy: 0 };
  const container = {
    running: false,
    images: { toolchain: 'fixture-digest' },
    start(options) {
      calls.start += 1;
      assert.equal(options.enableInternet, false);
      this.running = true;
    },
    async setInactivityTimeout() {},
    async exec(_args, options) {
      calls.exec += 1;
      const guest = await new Response(options.stdin).json();
      return {
        stdout: new Blob([
          JSON.stringify({
            exitCode: 0,
            output: 'hi\n',
            outcome: 'exited',
            files: guest.files,
          }),
        ]).stream(),
        exitCode: Promise.resolve(0),
      };
    },
    async destroy() {
      calls.destroy += 1;
      this.running = false;
    },
  };
  return { container, calls };
}

function coordinatorFixture({ execute = true } = {}) {
  const calls = { claimStart: 0, mayExecute: 0, complete: [] };
  return {
    calls,
    stub: {
      async claimStart() {
        calls.claimStart += 1;
        return true;
      },
      async mayExecute() {
        calls.mayExecute += 1;
        return execute;
      },
      async complete(claim, state, result) {
        calls.complete.push({ runId: claim.run_id, state, result });
      },
    },
  };
}

function setup(t, options = {}) {
  const store = options.store ?? storageFixture();
  const guest = options.guest ?? containerFixture();
  const coordinator = coordinatorFixture(options);
  const fetches = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    fetches.push(new URL(url).pathname);
    if (options.fetch) return options.fetch(url, init);
    return Response.json(job);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = {
    PLAYGROUND_INGRESS_SECRET: 'x'.repeat(40),
    PLAYGROUND_SOURCE_ORIGIN: 'https://web.example',
    PLAYGROUND_COORDINATOR: { getByName: () => coordinator.stub },
  };
  const ctx = {
    storage: store.storage,
    container: guest.container,
    blockConcurrencyWhile: (callback) => callback(),
  };
  return {
    store,
    guest,
    coordinator,
    fetches,
    ctx,
    env,
    slot: () => new PlaygroundSlot(ctx, env),
  };
}

const claim = (runId = 'run-1') => ({
  run_id: runId,
  generation: 1,
  slot: 0,
  deadline: Date.now() + 50_000,
});
const identity = { ownerId: OWNER, projectId: PROJECT, meetingId: MEETING };
const tickets = ['s'.repeat(64), 'e'.repeat(64)];

test('a normal Run makes one source fetch, one guest start, one command and one completion', async (t) => {
  const fx = setup(t);
  const slot = fx.slot();
  assert.equal(
    await slot.assign(claim(), identity, 3, ...tickets, 'stdin bytes'),
    true
  );
  assert.equal(fx.store.values.has('stdin'), true);
  await slot.alarm();

  assert.deepEqual(fx.fetches, [
    '/api/v1/internal/playground-execution/source',
  ]);
  assert.deepEqual(fx.guest.calls, { start: 1, exec: 1, destroy: 1 });
  assert.equal(fx.coordinator.calls.claimStart, 1);
  assert.equal(fx.coordinator.calls.mayExecute, 2);
  assert.deepEqual(
    fx.coordinator.calls.complete.map(({ state }) => state),
    ['succeeded']
  );
  assert.equal(fx.coordinator.calls.complete[0].result.output, 'hi\n');
  assert.equal(fx.coordinator.calls.complete[0].result.sandboxFailed, false);
  // The journal, sealed input and deadline alarm are all cleared.
  assert.equal(fx.store.values.size, 0);
  assert.equal(fx.store.alarm(), null);
  // assign (2 puts + alarm), phase write, stdin delete, final clear.
  assert.deepEqual(fx.store.counts, {
    put: 3,
    delete: 2,
    setAlarm: 1,
    deleteAlarm: 1,
  });

  // A duplicate alarm after completion does no work.
  await slot.alarm();
  assert.equal(fx.fetches.length, 1);
  assert.deepEqual(fx.guest.calls, { start: 1, exec: 1, destroy: 1 });
  assert.equal(fx.coordinator.calls.complete.length, 1);
});

test('a restart after the start intent fails the Run without replaying it', async (t) => {
  const fx = setup(t);
  await fx.slot().assign(claim(), identity, 3, ...tickets, undefined);
  // The previous instance journaled the start and then faulted.
  const assignment = fx.store.values.get('assignment');
  fx.store.values.set('assignment', { ...assignment, phase: 'starting' });
  fx.guest.container.running = true;

  const restarted = fx.slot();
  await restarted.alarm();
  assert.deepEqual(fx.fetches, []);
  assert.deepEqual(fx.guest.calls, { start: 0, exec: 0, destroy: 1 });
  assert.equal(fx.coordinator.calls.claimStart, 0);
  assert.deepEqual(
    fx.coordinator.calls.complete.map(({ state }) => state),
    ['failed']
  );
  assert.equal(fx.store.values.size, 0);

  // Duplicate and later alarms reconcile nothing further.
  await restarted.alarm();
  await fx.slot().alarm();
  assert.equal(fx.coordinator.calls.complete.length, 1);
  assert.equal(fx.guest.calls.start, 0);
});

test('an unconfirmed teardown keeps the slot occupied and reports nothing', async (t) => {
  const guest = containerFixture();
  guest.container.destroy = async () => {
    guest.calls.destroy += 1;
  };
  const fx = setup(t, { guest });
  await fx.slot().assign(claim(), identity, 3, ...tickets, undefined);
  const assignment = fx.store.values.get('assignment');
  fx.store.values.set('assignment', { ...assignment, phase: 'starting' });
  guest.container.running = true;

  await fx.slot().alarm();
  assert.equal(fx.coordinator.calls.complete.length, 0);
  assert.equal(fx.store.values.has('assignment'), true);
  // A different Run cannot take the occupied slot.
  assert.equal(
    await fx.slot().assign(claim('run-2'), identity, 3, ...tickets, undefined),
    false
  );
});

test('a Stop during the source fetch cancels before any guest starts', async (t) => {
  const fx = setup(t, {
    fetch: (_url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new Error('aborted'))
        );
      }),
  });
  const slot = fx.slot();
  await slot.assign(claim(), identity, 3, ...tickets, undefined);
  const running = slot.alarm();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await slot.stop(claim()), true);
  await running;

  assert.deepEqual(fx.guest.calls, { start: 0, exec: 0, destroy: 0 });
  assert.deepEqual(
    fx.coordinator.calls.complete.map(({ state }) => state),
    ['cancelled']
  );
  assert.equal(fx.store.values.size, 0);
});

test('a durable pause after the source fetch fences the guest start', async (t) => {
  const fx = setup(t, { execute: false });
  await fx.slot().assign(claim(), identity, 3, ...tickets, undefined);
  await fx.slot().alarm();
  assert.equal(fx.fetches.length, 1);
  assert.deepEqual(fx.guest.calls, { start: 0, exec: 0, destroy: 0 });
  assert.deepEqual(
    fx.coordinator.calls.complete.map(({ state }) => state),
    ['failed']
  );
});

test('assignment is idempotent per Run and refuses expired or overlapping work', async (t) => {
  const fx = setup(t);
  const slot = fx.slot();
  assert.equal(
    await slot.assign(claim(), identity, 3, ...tickets, undefined),
    true
  );
  const puts = fx.store.counts.put;
  assert.equal(
    await slot.assign(claim(), identity, 3, ...tickets, undefined),
    true
  );
  assert.equal(fx.store.counts.put, puts);
  assert.equal(
    await slot.assign(claim('run-2'), identity, 3, ...tickets, undefined),
    false
  );

  const fresh = setup(t);
  const expired = { ...claim(), deadline: Date.now() - 1 };
  assert.equal(
    await fresh.slot().assign(expired, identity, 3, ...tickets, undefined),
    false
  );
  assert.equal(fresh.store.values.size, 0);
});

test('a launcher that cannot build its sandbox reports a service failure', async (t) => {
  const guest = containerFixture();
  guest.container.exec = async () => {
    guest.calls.exec += 1;
    return {
      stdout: new Blob([
        JSON.stringify({
          exitCode: 126,
          output: '',
          outcome: 'sandbox_failed',
          files: null,
        }),
      ]).stream(),
      exitCode: Promise.resolve(0),
    };
  };
  const fx = setup(t, { guest });
  await fx.slot().assign(claim(), identity, 3, ...tickets, undefined);
  await fx.slot().alarm();
  assert.deepEqual(fx.guest.calls, { start: 1, exec: 1, destroy: 1 });
  assert.equal(fx.fetches.length, 1);
  const [completion] = fx.coordinator.calls.complete;
  assert.equal(completion.state, 'failed');
  assert.equal(completion.result.sandboxFailed, true);
  assert.equal(completion.result.exitCode, 126);
});
