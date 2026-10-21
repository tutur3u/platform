import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { meetFixture } from './meet-native-fixture.mjs';
import { createMeetOwner, createMeetStartup } from './meet-native-graph.mjs';
import {
  assertMeetCopy,
  createMeetFinalizer,
  prepareMeetGraph,
  readMeetRegistry,
} from './meet-native-graph-files.mjs';
import { createMeetPolicy } from './meet-native-policy.mjs';
import { inspectMeetGraph } from './meet-native-profile.mjs';
import { projectMeetRegistry } from './meet-native-registry-facts.mjs';
import { observeOwnedChild } from './native-wrangler-observable.mjs';

test('owned child observation waits for natural close and both output pipes', async () => {
  const output = { stdout: '', stderr: '' };
  const child = spawn(
    process.execPath,
    ['-e', 'process.stdout.write("out"); process.stderr.write("err");'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const outcome = await observeOwnedChild(child, (stream, bytes) => {
    output[stream] += bytes;
  });
  assert.equal(outcome.code, 0);
  assert.equal(outcome.signal, null);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.closeObserved, true);
  assert.equal(outcome.stdioDrained, true);
  assert.equal(outcome.intervened, false);
  assert.deepEqual(output, { stdout: 'out', stderr: 'err' });
});

for (const failing of [
  'none',
  'app-acquire',
  'app-ready',
  'probe-acquire',
  'probe-ready',
  'both-dispose',
])
  test(`graph lifecycle ${failing} retains failures and reverses exact-once disposal`, async () => {
    const calls = [],
      primary = new Error('primary'),
      failure = new Error(failing),
      disposals = [];
    const inputs = { app: 'app', probe: 'probe' };
    const owner = createMeetOwner(async (role) => {
      calls.push(`acquire:${role}`);
      if (failing === `${role}-acquire`) throw failure;
      return {
        get ready() {
          calls.push(`ready:${role}`);
          return failing === `${role}-ready`
            ? Promise.reject(failure)
            : Promise.resolve();
        },
        url: Promise.resolve(new URL('http://127.0.0.1:1234')),
        fetch() {},
        dispose() {
          calls.push(`dispose:${role}`);
          if (failing === 'both-dispose') {
            const error = new Error(`dispose-${role}`);
            disposals.push(error);
            throw error;
          }
        },
      };
    }, inputs);
    if (['none', 'both-dispose'].includes(failing)) await owner.start();
    else await assert.rejects(owner.start(), (error) => error === failure);
    const result = await owner.finish(primary);
    assert.equal(await owner.finish(new Error('late')), result);
    const acquired = calls
      .filter((c) => c.startsWith('ready:'))
      .map((c) => c.slice(6));
    assert.deepEqual(
      calls.filter((c) => c.startsWith('dispose:')),
      acquired.reverse().map((role) => `dispose:${role}`)
    );
    assert.ok(result.errors.includes(primary));
    if (failing === 'both-dispose')
      assert.deepEqual(result.errors, [primary, ...disposals]);
    else if (failing !== 'none') assert.ok(result.errors.includes(failure));
    assert.equal(result.receipt.internalCleanup, 'UNKNOWN');
  });

for (const mutation of ['none', 'copy', 'foreign', 'residual', 'removal'])
  test(`post-child graph finalizer ${mutation} independently checks and retains evidence`, async (t) => {
    const f = await meetFixture(t),
      plan = await inspectMeetGraph(f.options),
      prepared = await prepareMeetGraph(plan, f.context);
    if (mutation === 'copy')
      await writeFile(join(prepared.roles.probe.root, 'probe.mjs'), 'mutated');
    if (mutation === 'foreign')
      await writeFile(f.context.foreignPath, 'mutated');
    if (mutation === 'residual')
      await mkdir(join(f.context.tempRoot, 'foreign-sdk-residual'));
    const removal = new Error('removal denied');
    const finalize = createMeetFinalizer(
      plan,
      prepared,
      mutation === 'removal'
        ? async () => {
            throw removal;
          }
        : undefined
    );
    const result = await finalize();
    assert.equal(await finalize(), result);
    assert.equal(result.phases.originalSeal.ok, true);
    assert.equal(result.phases.snapshot.ok, true);
    assert.ok(result.snapshot.seal);
    const persisted = JSON.parse(
      await readFile(join(prepared.caseRoot, 'parent-finalization.json'))
    );
    assert.equal(persisted.internalCleanup, 'UNKNOWN');
    if (mutation === 'none') {
      assert.equal(result.errors.length, 0);
      await assert.rejects(realpath(prepared.scratch));
    } else {
      assert.ok(result.errors.length > 0);
      await realpath(prepared.scratch);
      if (mutation === 'removal') assert.ok(result.errors.includes(removal));
    }
  });

test('failed snapshot preserves primary and both seal errors, and never removes source', async (t) => {
  const f = await meetFixture(t),
    plan = await inspectMeetGraph(f.options),
    prepared = await prepareMeetGraph(plan, f.context);
  const primary = new Error('primary fixture failure');
  await writeFile(join(f.app, 'dist/client/asset.js'), 'original mutation');
  await writeFile(
    join(prepared.roles.app.root, 'client/asset.js'),
    'copy mutation'
  );
  prepared.diagnosticRoot = prepared.caseRoot;
  let removed = 0;
  const result = await createMeetFinalizer(plan, prepared, async () => {
    removed++;
  })([primary]);
  assert.equal(result.errors[0], primary);
  assert.equal(result.phases.originalSeal.ok, false);
  assert.equal(result.phases.copySeal.ok, false);
  assert.equal(result.phases.snapshot.ok, false);
  assert.equal(result.phases.foreign.ok, true);
  assert.equal(removed, 0);
  await realpath(prepared.scratch);
});

test('fresh preparations have independent empty registries and disjoint storage custody', async (t) => {
  const f = await meetFixture(t),
    plan = await inspectMeetGraph(f.options);
  const first = await prepareMeetGraph(plan, f.context);
  await writeFile(join(first.registry, 'foreign-worker'), '{}');
  const nextCase = join(f.root, 'second');
  const nextTemp = join(nextCase, 'native-sdk-temp');
  await mkdir(nextTemp, { recursive: true });
  const second = await prepareMeetGraph(plan, {
    ...f.context,
    caseRoot: nextCase,
    tempRoot: nextTemp,
  });
  assert.notEqual(first.registry, second.registry);
  assert.notEqual(first.roles.app.root, second.roles.app.root);
  assert.deepEqual(await readdir(second.registry), []);
  assert.deepEqual(await readdir(first.registry), ['foreign-worker']);
  await assertMeetCopy(plan, second, true);
});

function startupFixture(respond, readRegistry = async () => {}) {
  const calls = [],
    policies = {
      app: createMeetPolicy('app'),
      probe: createMeetPolicy('probe'),
    };
  const owner = createMeetOwner(
    async (role) => ({
      ready: Promise.resolve(),
      url: Promise.resolve(new URL('http://127.0.0.1:1234')),
      fetch(url, options) {
        calls.push({ role, url, options });
        return respond(role, policies);
      },
      dispose() {
        calls.push(`dispose:${role}`);
      },
    }),
    { app: 'app', probe: 'probe' }
  );
  const startup = createMeetStartup(owner, policies, readRegistry, async () => {
    calls.push('project');
    return { schema: 1, entries: [] };
  });
  return { startup, calls, policies };
}

const validResponse = (role) =>
  role === 'app'
    ? Response.json({ version: 1 })
    : new Response('Forbidden', { status: 403 });
const nextTurn = () => new Promise(setImmediate);

test('public startup responses and complete body drains precede strict registry admission', async () => {
  const headers = {
    app: Promise.withResolvers(),
    probe: Promise.withResolvers(),
  };
  const streams = {};
  let admitted = 0;
  const f = startupFixture(
    (role) => headers[role].promise,
    async () => {
      admitted++;
    }
  );
  const starting = f.startup.start();
  await nextTurn();
  assert.equal(admitted, 0, 'registry must wait for public dispatch');
  for (const role of ['app', 'probe']) {
    assert.equal(f.calls.at(-1).role, role);
    const body = new ReadableStream({
      start(controller) {
        streams[role] = controller;
      },
    });
    const response = new Response(body, { status: role === 'app' ? 200 : 403 });
    headers[role].resolve(response);
    await nextTurn();
    assert.equal(admitted, 0, 'registry must wait for complete body');
    assert.equal(response.bodyUsed, true);
    streams[role].enqueue(
      new TextEncoder().encode(role === 'app' ? '{"version":1}' : 'Forbidden')
    );
    await nextTurn();
    assert.equal(admitted, 0, 'bytes without EOF are insufficient');
    streams[role].close();
    await nextTurn();
  }
  await starting;
  assert.equal(admitted, 1);
  assert.deepEqual(f.calls, [
    {
      role: 'app',
      url: 'https://meet.tuturuuu.com/.well-known/meeting-runtime',
      options: { method: 'GET', redirect: 'manual' },
    },
    {
      role: 'probe',
      url: 'https://meet-ci-probe.invalid/startup-denial',
      options: { method: 'POST', redirect: 'manual' },
    },
  ]);
  const result = await f.startup.finish();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(f.calls.slice(-2), ['dispose:probe', 'dispose:app']);
});

for (const role of ['app', 'probe'])
  for (const mutation of ['status', 'body', 'fetch', 'drain', 'egress'])
    test(`startup ${role} ${mutation} failure retains primary and cleans both handles`, async () => {
      const primary = new Error('public response failure');
      let admitted = 0;
      const f = startupFixture(
        (current, policies) => {
          if (current !== role) return validResponse(current);
          if (mutation === 'fetch') throw primary;
          if (mutation === 'drain')
            return new Response(
              new ReadableStream({
                start(c) {
                  c.error(primary);
                },
              }),
              { status: role === 'app' ? 200 : 403 }
            );
          if (mutation === 'egress')
            policies[role].unexpected.push({ fixture: true });
          if (mutation === 'status')
            return new Response(
              role === 'app' ? '{"version":1}' : 'Forbidden',
              { status: 201 }
            );
          if (mutation === 'body')
            return new Response(
              role === 'app' ? '{"version":2}' : 'forbidden',
              { status: role === 'app' ? 200 : 403 }
            );
          return validResponse(current);
        },
        async () => {
          admitted++;
        }
      );
      let failure;
      await assert.rejects(f.startup.start(), (error) => {
        failure = error;
        return true;
      });
      assert.equal(admitted, 0);
      if (['fetch', 'drain'].includes(mutation)) assert.equal(failure, primary);
      const result = await f.startup.finish(failure);
      assert.ok(result.errors.includes(failure));
      assert.deepEqual(result.receipt.preDisposalRegistry, {
        schema: 1,
        entries: [],
      });
      assert.equal(await f.startup.finish(new Error('late')), result);
      assert.deepEqual(f.calls.slice(-3), [
        'project',
        'dispose:probe',
        'dispose:app',
      ]);
    });

test('complete public responses do not admit an empty real registry', async (t) => {
  const f = await meetFixture(t),
    plan = await inspectMeetGraph(f.options),
    prepared = await prepareMeetGraph(plan, f.context);
  const graph = startupFixture(validResponse, () =>
    readMeetRegistry(prepared, Date.now())
  );
  await assert.rejects(graph.startup.start(), /Registry user roles/);
  assert.equal(graph.calls.length, 2);
  const result = await graph.startup.finish();
  assert.equal(result.errors.length, 1);
  assert.deepEqual(graph.calls.slice(-3), [
    'project',
    'dispose:probe',
    'dispose:app',
  ]);
});

test('registry projection failure never masks startup or disposal failures', async () => {
  const primary = new Error('primary'),
    disposal = new Error('disposal'),
    projection = new Error('projection');
  const owner = createMeetOwner(
    async () => ({
      ready: Promise.resolve(),
      url: new URL('http://127.0.0.1:1234'),
      fetch() {
        throw primary;
      },
      dispose() {
        throw disposal;
      },
    }),
    { app: 'app', probe: 'probe' }
  );
  const startup = createMeetStartup(
    owner,
    { app: createMeetPolicy('app'), probe: createMeetPolicy('probe') },
    async () => {},
    async () => {
      throw projection;
    }
  );
  await assert.rejects(startup.start(), (error) => error === primary);
  const result = await startup.finish();
  assert.deepEqual(result.errors, [primary, disposal, disposal, projection]);
  assert.equal(result.receipt.preDisposalRegistry.status, 'unavailable');
});

async function populatedRegistry(t) {
  const f = await meetFixture(t),
    plan = await inspectMeetGraph(f.options),
    prepared = await prepareMeetGraph(plan, f.context);
  const values = Object.fromEntries(
    ['tuturuuu-meet', 'meet-ci-binding-probe'].map((name, i) => [
      name,
      {
        instanceId: `private-session-${i}`,
        debugPortAddress: `127.0.0.1:${1234 + i}`,
        userWorkerService: `core:user:${name}`,
        defaultEntrypointService: i
          ? `core:user:${name}`
          : `assets:rpc-proxy:${name}`,
      },
    ])
  );
  for (const [name, value] of Object.entries(values))
    await writeFile(join(prepared.registry, name), JSON.stringify(value));
  return { prepared, values };
}

for (const mutation of [
  'none',
  'foreign',
  'mapping',
  'nonloopback',
  'stale',
  'reused',
])
  test(`public response barriers preserve real registry admission: ${mutation}`, async (t) => {
    const { prepared, values } = await populatedRegistry(t);
    const name = 'tuturuuu-meet',
      app = values[name];
    if (mutation === 'foreign')
      await writeFile(join(prepared.registry, 'foreign'), '{}');
    if (mutation === 'mapping') app.userWorkerService = 'foreign';
    if (mutation === 'nonloopback') app.debugPortAddress = '10.0.0.1:1234';
    if (mutation === 'reused')
      app.instanceId = values['meet-ci-binding-probe'].instanceId;
    await writeFile(join(prepared.registry, name), JSON.stringify(app));
    if (mutation === 'stale')
      await utimes(join(prepared.registry, name), new Date(0), new Date(0));
    const graph = startupFixture(validResponse, () =>
      readMeetRegistry(prepared, 100)
    );
    if (mutation === 'none') await graph.startup.start();
    else await assert.rejects(graph.startup.start());
    assert.equal(graph.calls.length, 2);
    const result = await graph.startup.finish();
    assert.equal(result.errors.length, mutation === 'none' ? 0 : 1);
  });

test('projected registry facts are bounded and privacy safe', async (t) => {
  const { prepared } = await populatedRegistry(t);
  const facts = await projectMeetRegistry(prepared, 100);
  assert.deepEqual(facts, {
    schema: 1,
    truncated: false,
    reusedInstance: false,
    entries: ['app', 'probe'].map((role) => ({
      role,
      regular: true,
      bounded: true,
      fresh: true,
      parsed: true,
      closed: true,
      loopback: true,
      userMapping: true,
      entryMapping: true,
      instancePresent: true,
    })),
  });
  const sentinel = 'DO_NOT_RETAIN_CREDENTIAL';
  await writeFile(join(prepared.registry, 'private-unknown-name'), sentinel);
  await writeFile(
    join(prepared.registry, 'tuturuuu-meet'),
    JSON.stringify({
      ...JSON.parse(await readFile(join(prepared.registry, 'tuturuuu-meet'))),
      instanceId: sentinel,
      secret: sentinel,
    })
  );
  const projection = await projectMeetRegistry(prepared, 100);
  const serialized = JSON.stringify(projection);
  for (const privateValue of [
    sentinel,
    'private-unknown-name',
    'private-session',
    '127.0.0.1',
    'core:user',
    'assets:rpc-proxy',
  ])
    assert.equal(serialized.includes(privateValue), false);
  assert.equal(projection.entries.find((e) => e.role === 'app').closed, false);
  assert.deepEqual(
    projection.entries.find((e) => e.role === 'foreign'),
    { role: 'foreign', regular: true }
  );
  for (let i = 0; i < 8; i++)
    await writeFile(join(prepared.registry, `foreign-${i}`), sentinel);
  const bounded = await projectMeetRegistry(prepared, 100);
  assert.equal(bounded.entries.length, 4);
  assert.equal(bounded.truncated, true);
});

for (const shape of ['symlink', 'oversized', 'malformed', 'unavailable'])
  test(`registry projection does not read or retain unsupported ${shape} contents`, async (t) => {
    const f = await meetFixture(t),
      registry = join(f.root, 'projected-registry');
    const sentinel = 'DO_NOT_RETAIN_CREDENTIAL';
    if (shape !== 'unavailable') await mkdir(registry);
    const path = join(registry, 'tuturuuu-meet');
    if (shape === 'symlink') {
      const target = join(f.root, 'private-target');
      await writeFile(target, sentinel);
      await symlink(target, path);
    }
    if (shape === 'oversized') await writeFile(path, sentinel.repeat(500));
    if (shape === 'malformed') await writeFile(path, sentinel);
    if (shape === 'unavailable') {
      await assert.rejects(projectMeetRegistry({ registry }, 0), {
        message: 'Meet registry projection unavailable',
      });
      return;
    }
    const facts = await projectMeetRegistry({ registry }, 0);
    assert.equal(JSON.stringify(facts).includes(sentinel), false);
    const fact = facts.entries[0];
    if (shape === 'symlink')
      assert.deepEqual(fact, { role: 'app', regular: false });
    if (shape === 'oversized') assert.equal(fact.bounded, false);
    if (shape === 'malformed') assert.equal(fact.parsed, false);
  });

test('startup failure and a distinct final primary are both retained', async () => {
  const startupFailure = new Error('startup'),
    finalPrimary = new Error('final');
  const f = startupFixture(() => {
    throw startupFailure;
  });
  await assert.rejects(f.startup.start(), (error) => error === startupFailure);
  const result = await f.startup.finish(finalPrimary);
  assert.deepEqual(result.errors, [finalPrimary, startupFailure]);
});

test('failure receipt captures live registry facts before either public disposal', async (t) => {
  const { prepared } = await populatedRegistry(t);
  const primary = new Error('primary');
  const disposed = [];
  const owner = createMeetOwner(
    async (role) => ({
      ready: Promise.resolve(),
      url: new URL('http://127.0.0.1:1234'),
      fetch: () => validResponse(role),
      async dispose() {
        disposed.push(role);
        for (const name of await readdir(prepared.registry))
          await unlink(join(prepared.registry, name));
      },
    }),
    { app: 'app', probe: 'probe' }
  );
  const startup = createMeetStartup(
    owner,
    { app: createMeetPolicy('app'), probe: createMeetPolicy('probe') },
    () => readMeetRegistry(prepared, 100),
    () => projectMeetRegistry(prepared, 100)
  );
  await startup.start();
  const result = await startup.finish(primary);
  assert.equal(await startup.finish(), result);
  assert.deepEqual(disposed, ['probe', 'app']);
  assert.deepEqual(await readdir(prepared.registry), []);
  assert.deepEqual(result.errors, [primary]);
  const persisted = JSON.parse(JSON.stringify(result.receipt));
  assert.deepEqual(
    persisted.preDisposalRegistry.entries.map(({ role }) => role),
    ['app', 'probe']
  );
  assert.equal(persisted.internalCleanup, 'UNKNOWN');
  assert.equal(persisted.descendantClosure, 'UNKNOWN');
});
