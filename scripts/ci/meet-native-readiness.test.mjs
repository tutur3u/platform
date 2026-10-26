import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeetOwner } from './meet-native-graph.mjs';

test('a proxy-ready app serves its public health before a dependent probe starts', async () => {
  const events = [];
  let healthy = false;
  const owner = createMeetOwner(
    async (role) => {
      if (role === 'probe')
        assert.equal(healthy, true, 'probe started before app health');
      events.push(`start:${role}`);
      return {
        ready: Promise.resolve(),
        url: new URL('http://127.0.0.1:1234'),
        async fetch() {
          await Promise.resolve();
          events.push('health:app');
          return Response.json({ version: 1 });
        },
        dispose() {
          events.push(`dispose:${role}`);
        },
      };
    },
    { app: 'app', probe: 'probe' },
    async (fetchApp) => {
      const response = await fetchApp(
        'https://meet.tuturuuu.com/.well-known/meeting-runtime'
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { version: 1 });
      healthy = true;
    }
  );
  await owner.start();
  assert.deepEqual(events, ['start:app', 'health:app', 'start:probe']);
  assert.deepEqual((await owner.finish()).errors, []);
  assert.deepEqual(events.slice(-2), ['dispose:probe', 'dispose:app']);
});

test('failed app dependency readiness prevents probe acquisition and disposes the app once', async () => {
  const starts = [],
    disposals = [];
  const failure = new Error('app health unavailable');
  const owner = createMeetOwner(
    async (role) => {
      starts.push(role);
      return {
        ready: Promise.resolve(),
        url: new URL('http://127.0.0.1:1234'),
        dispose() {
          disposals.push(role);
        },
      };
    },
    { app: 'app', probe: 'probe' },
    async () => {
      throw failure;
    }
  );
  await assert.rejects(owner.start(), (error) => error === failure);
  const result = await owner.finish();
  assert.deepEqual(result.errors, [failure]);
  assert.deepEqual(starts, ['app']);
  assert.deepEqual(disposals, ['app']);
  await owner.finish();
  assert.deepEqual(disposals, ['app']);
});
