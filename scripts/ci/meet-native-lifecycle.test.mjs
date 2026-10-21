import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { meetFixture } from './meet-native-fixture.mjs';
import { createMeetOwner } from './meet-native-graph.mjs';
import {
  assertMeetCopy,
  createMeetFinalizer,
  prepareMeetGraph,
} from './meet-native-graph-files.mjs';
import { inspectMeetGraph } from './meet-native-profile.mjs';
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
