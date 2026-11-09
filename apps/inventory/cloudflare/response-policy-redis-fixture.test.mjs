import assert from 'node:assert/strict';
import test from 'node:test';
import { createResponsePolicyRedisFixture } from './response-policy-redis-fixture.mjs';

const read = ['get', 'infrastructure:edge-abuse-protection-controls'];
const request = (host = 'https://redis.invalid', body = read, path = '/') =>
  new Request(`${host}${path}`, { method: 'POST', body: JSON.stringify(body) });

test('the local Redis read returns the Upstash null-result envelope', async () => {
  const fixture = createResponsePolicyRedisFixture();
  assert.deepEqual(await (await fixture.outbound(request())).json(), {
    result: null,
  });
  fixture.assertRequests();
});

test('the local pipeline read returns the Upstash pipeline envelope', async () => {
  const fixture = createResponsePolicyRedisFixture();
  assert.deepEqual(
    await (
      await fixture.outbound(
        request('https://redis.invalid', [read], '/pipeline')
      )
    ).json(),
    [{ result: null }]
  );
  fixture.assertRequests();
});

test('the error fixture remains bounded and read-only', async () => {
  const fixture = createResponsePolicyRedisFixture({ unavailable: true });
  assert.equal((await fixture.outbound(request())).status, 503);
  fixture.assertRequests();
});

for (const [name, host, body] of [
  ['another origin', 'https://other.invalid', read],
  ['a lookalike host', 'https://redis.invalid.attacker.invalid', read],
  ['a write', 'https://redis.invalid', ['set', 'key', 'value']],
  ['another read key', 'https://redis.invalid', ['get', 'other']],
]) {
  test(`the audit fails on ${name} even if a caller swallows the denial`, async () => {
    const fixture = createResponsePolicyRedisFixture();
    assert.equal((await fixture.outbound(request(host, body))).status, 599);
    assert.throws(() => fixture.assertRequests());
  });
}

test('the audit rejects requests beyond its budget', async () => {
  const fixture = createResponsePolicyRedisFixture();
  for (let index = 0; index < 4; index++) await fixture.outbound(request());
  assert.equal((await fixture.outbound(request())).status, 599);
  assert.throws(() => fixture.assertRequests());
});
