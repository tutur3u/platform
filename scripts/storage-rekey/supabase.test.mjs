import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngine } from './engine.mjs';
import { emptyLedger, mergeSelection } from './ledger.mjs';
import { createStorageClient, fetchServiceRoleKey } from './supabase.mjs';

const opaque = 'sb_secret_synthetic_test_only';
const jwt = 'eyJsynthetic.test.only';
const accessToken = 'synthetic_management_token';
const legacy = { name: 'service_role', type: 'legacy', api_key: jwt };
const secret = { name: 'default', type: 'secret', api_key: opaque };
const publicKeys = [
  { name: 'anon', type: 'legacy', api_key: 'synthetic_anon' },
  { name: 'default', type: 'publishable', api_key: 'sb_publishable_synthetic' },
  { name: 'service_role', type: 'publishable', api_key: 'synthetic_public' },
];

function select(keys) {
  return fetchServiceRoleKey({
    projectRef: 'test',
    accessToken,
    fetchImpl: async () => Response.json(keys),
  });
}

test('secret wins over legacy in either API response order', async () => {
  for (const keys of [
    [legacy, secret],
    [secret, legacy],
  ]) {
    assert.ok((await select(keys)) === opaque);
  }
});

test('legacy service_role is used only when no secret exists', async () => {
  assert.ok((await select([...publicKeys, legacy])) === jwt);
  assert.ok((await select([{ name: 'service_role', api_key: jwt }])) === jwt);
});

test('publishable and anon keys are never selected', async () => {
  for (const keys of [[], publicKeys, ...publicKeys.map((key) => [key])]) {
    await assert.rejects(select(keys), {
      code: 'service_role_key_unavailable',
    });
  }
});

for (const [kind, serviceKey] of [
  ['opaque', opaque],
  ['JWT', jwt],
]) {
  test(`${kind} headers are consistent for copy, remove and sign; HEAD is unauthenticated`, async () => {
    const calls = [];
    const storage = createStorageClient({
      projectRef: 'test',
      serviceKey,
      bucket: 'test bucket',
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (init.method === 'DELETE') return Response.json([{}]);
        if (url.includes('/sign/')) {
          return Response.json({
            signedURL: '/object/sign/test?token=synthetic',
          });
        }
        return Response.json({ Id: 'copy-id' });
      },
    });
    assert.deepEqual(await storage.copy('old', 'new'), { id: 'copy-id' });
    assert.deepEqual(await storage.remove(['old']), { removed: 1 });
    const signed = await storage.sign('old', 600);
    assert.equal(await storage.headStatus(signed), 200);
    assert.deepEqual(
      calls.map(({ init }) => init.method),
      ['POST', 'DELETE', 'POST', 'HEAD']
    );
    for (const { init } of calls.slice(0, 3)) {
      const headers = new Headers(init.headers);
      assert.ok(headers.get('apikey') === serviceKey);
      assert.equal(headers.get('content-type'), 'application/json');
      assert.equal(headers.has('authorization'), kind === 'JWT');
      if (kind === 'JWT') {
        assert.ok(headers.get('authorization') === `Bearer ${serviceKey}`);
      }
      assert.equal([...headers].length, kind === 'JWT' ? 3 : 2);
    }
    assert.equal(calls[3].url, signed);
    assert.equal([...new Headers(calls[3].init.headers)].length, 0);
  });
}

test('Management API keeps its access-token Bearer header', async () => {
  await fetchServiceRoleKey({
    projectRef: 'test',
    accessToken,
    fetchImpl: async (_url, init) => {
      const headers = new Headers(init.headers);
      assert.ok(headers.get('authorization') === `Bearer ${accessToken}`);
      assert.equal(headers.has('apikey'), false);
      return Response.json([secret]);
    },
  });
});

test('keys never reach console output, operation errors or engine events', async (t) => {
  const output = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    t.mock.method(console, method, (...args) => output.push(args));
  }
  for (const serviceKey of [opaque, jwt]) {
    assert.ok(
      (await select([{ ...secret, api_key: serviceKey }])) === serviceKey
    );
    for (const failure of ['http', 'network']) {
      const fetchImpl = async () => {
        if (failure === 'network') {
          throw new Error(`transport exposed ${serviceKey} ${accessToken}`);
        }
        return Response.json(
          { message: `upstream exposed ${serviceKey} ${accessToken}` },
          { status: 400 }
        );
      };
      const storage = createStorageClient({
        projectRef: 'test',
        serviceKey,
        bucket: 'test',
        fetchImpl,
      });
      const errors = [];
      for (const operation of [
        () => storage.copy('old', 'new'),
        () => storage.remove(['old']),
        () => storage.sign('old', 600),
      ]) {
        await assert.rejects(operation(), (error) => {
          errors.push({ ...error, message: error.message, stack: error.stack });
          return error.code.endsWith(
            failure === 'http' ? '_http_400' : '_network'
          );
        });
      }
      await assert.rejects(
        fetchServiceRoleKey({ projectRef: 'test', accessToken, fetchImpl }),
        (error) => {
          errors.push({ ...error, message: error.message, stack: error.stack });
          return (
            error.code ===
            (failure === 'http' ? 'api_keys_http_400' : 'api_keys_network')
          );
        }
      );
      const ledger = emptyLedger({
        projectRef: 'test',
        environment: 'staging',
        bucket: 'test',
        now: 't',
      });
      mergeSelection(
        ledger,
        [
          {
            id: 'object-1',
            root: 'chats',
            wsId: 'ws',
            name: 'ws/chats/c/old',
            updatedAt: 't',
            size: '5',
          },
        ],
        { now: 't' }
      );
      const events = [];
      const engine = createEngine({
        ledger,
        save: () => {},
        sql: {
          read: async (query) =>
            query === 'precheck'
              ? [{ present: true, name: 'ws/chats/c/old', updated_at: 't' }]
              : [],
        },
        storage,
        fence: { beforeOperation() {}, used: 0 },
        roots: { chats: { precheckSql: () => 'precheck' } },
        log: (event, fields) => events.push({ event, ...fields }),
        retry: { attempts: 1 },
      });
      const result = await engine.run({ root: 'chats', batchSize: 1 });
      assert.equal(ledger.objects['object-1'].state, 'failed');
      assert.equal(ledger.objects['object-1'].failedFrom, 'selected');
      assert.ok(events.some((event) => event.event === 'object'));
      assert.ok(events.some((event) => event.event === 'batch'));
      const serialized = JSON.stringify({ output, errors, events, result });
      for (const key of [opaque, jwt, accessToken]) {
        assert.equal(serialized.includes(key), false, 'credential leaked');
      }
    }
  }
  assert.equal(output.length, 0);
});
