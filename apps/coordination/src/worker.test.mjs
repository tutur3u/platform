import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createTestHarness } from 'wrangler';

const token = randomUUID() + randomUUID();
const server = createTestHarness({
  workers: [
    {
      configPath: 'apps/coordination/wrangler.jsonc',
      secrets: { COORDINATION_TOKEN: token },
    },
  ],
});
before(async () => {
  await server.listen();
});
after(async () => {
  await server.close();
});
const digest = (value) => createHash('sha256').update(value).digest('hex');
const request = (namespace = 'authenticator') => ({
  namespace,
  key: digest(randomUUID()),
  owner: randomUUID(),
});
async function call(input, auth = token) {
  const response = await server.fetch('/v1/coordinate', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: await response.json() };
}
async function result(input) {
  const response = await call(input);
  assert.equal(response.status, 200);
  return response.body;
}

test('requires server credentials and refuses invalid or oversized input', async () => {
  const input = { ...request(), action: 'acquire' };
  assert.equal((await call(input, 'wrong')).status, 401);
  for (const change of [
    { key: 'email@example.com' },
    { namespace: 'unknown' },
    { owner: 'bad' },
    { action: 'complete' },
    { extra: 'payload' },
    { key: 'a'.repeat(3000) },
  ]) {
    assert.equal((await call({ ...input, ...change })).status, 400);
  }
  assert.equal((await server.fetch('/v1/coordinate')).status, 404);
});

test('exactly one simultaneous registration acquires the lease', async () => {
  const input = request();
  const replies = await Promise.all(
    Array.from({ length: 20 }, () =>
      result({ ...input, owner: randomUUID(), action: 'acquire' })
    )
  );
  assert.equal(
    replies.filter((reply) => reply.outcome === 'acquired').length,
    1
  );
  assert.equal(replies.filter((reply) => reply.outcome === 'busy').length, 19);
  assert.equal(
    (await result({ ...request(), action: 'acquire' })).outcome,
    'acquired'
  );
});

test('a different owner cannot check, release, or complete a lease', async () => {
  const input = { ...request('meeting'), fingerprint: digest('details') };
  await result({ ...input, action: 'acquire' });
  const { fingerprint: _, ...lease } = input;
  for (const action of ['check', 'release', 'complete']) {
    assert.equal(
      (await result({ ...lease, owner: randomUUID(), action })).outcome,
      'lost'
    );
  }
  assert.equal((await result({ ...lease, action: 'check' })).outcome, 'owned');
});

test('completed meeting state survives release, eviction, and retry', async () => {
  const input = { ...request('meeting'), fingerprint: digest('details') };
  assert.deepEqual(await result({ ...input, action: 'acquire' }), {
    outcome: 'acquired',
    fresh: true,
    completed: false,
  });
  const { fingerprint: _, ...lease } = input;
  await result({ ...lease, action: 'complete' });
  await result({ ...lease, action: 'release' });
  await server
    .getWorker()
    .evictDurableObject('COORDINATION', { name: `meeting:${input.key}` });
  assert.deepEqual(
    await result({ ...input, owner: randomUUID(), action: 'acquire' }),
    { outcome: 'acquired', fresh: false, completed: true }
  );
});

test('failed meeting retries retain payload binding without marking complete', async () => {
  const input = { ...request('meeting'), fingerprint: digest('details') };
  await result({ ...input, action: 'acquire' });
  const { fingerprint: _, ...lease } = input;
  await result({ ...lease, action: 'release' });
  assert.equal(
    (
      await result({
        ...input,
        fingerprint: digest('different'),
        action: 'acquire',
      })
    ).outcome,
    'conflict'
  );
  assert.deepEqual(
    await result({ ...input, owner: randomUUID(), action: 'acquire' }),
    { outcome: 'acquired', fresh: false, completed: false }
  );
});

test('expired lease cannot mutate its successor', async () => {
  const input = { ...request('meeting'), fingerprint: digest('details') };
  await result({ ...input, action: 'acquire' });
  const sql = await server
    .getWorker()
    .getDurableObjectStorage('COORDINATION', { name: `meeting:${input.key}` });
  await sql.exec('UPDATE coordination SET lease_until = 0');
  const successor = { ...input, owner: randomUUID() };
  assert.equal(
    (await result({ ...successor, action: 'acquire' })).outcome,
    'acquired'
  );
  const { fingerprint: _, ...lease } = input;
  for (const action of ['release', 'complete'])
    assert.equal((await result({ ...lease, action })).outcome, 'lost');
  const rows = await sql.exec('SELECT owner, completed FROM coordination');
  assert.equal(rows[0].owner, successor.owner);
  assert.equal(rows[0].completed, 0);
});

test('expiry removes old records and namespaces do not collide', async () => {
  const input = { ...request('meeting'), fingerprint: digest('details') };
  await result({ ...input, action: 'acquire' });
  const sql = await server
    .getWorker()
    .getDurableObjectStorage('COORDINATION', { name: `meeting:${input.key}` });
  await sql.exec('UPDATE coordination SET expires_at = 0');
  assert.deepEqual(
    await result({ ...input, fingerprint: digest('new'), action: 'acquire' }),
    { outcome: 'acquired', fresh: true, completed: false }
  );
  const { fingerprint: _, ...lease } = input;
  assert.equal(
    (await result({ ...lease, namespace: 'authenticator', action: 'acquire' }))
      .outcome,
    'acquired'
  );
});
