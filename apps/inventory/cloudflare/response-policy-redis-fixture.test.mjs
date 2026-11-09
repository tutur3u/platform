import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  createResponsePolicyRedisFixture,
  slidingWindowSha,
} from './response-policy-redis-fixture.mjs';

const read = ['get', 'infrastructure:edge-abuse-protection-controls'];
const bucket = (window = 'minute', limit = 60, duration = 60000) => {
  const now = Date.now();
  const index = Math.floor(now / duration);
  const prefix = `proxy:inventory:api:default:anonymous:get:${window}:ip:127.0.0.1:`;
  return [
    'evalsha',
    slidingWindowSha,
    2,
    `${prefix}${index}`,
    `${prefix}${index - 1}`,
    limit,
    now,
    duration,
    1,
  ];
};
async function send(
  fixture,
  body = read,
  host = 'https://redis.invalid',
  pipeline = false
) {
  const finish = fixture.beginRequest();
  try {
    return await fixture.outbound(
      new Request(`${host}${pipeline ? '/pipeline' : '/'}`, {
        method: 'POST',
        body: JSON.stringify(pipeline ? [body] : body),
      })
    );
  } finally {
    finish();
  }
}

test('the permitted SHA matches the shipped rate-limit script', () => {
  const require = createRequire(
    new URL('../../../packages/utils/package.json', import.meta.url)
  );
  const source = readFileSync(require.resolve('@upstash/ratelimit'), 'utf8');
  const script = source.match(/var slidingWindowLimitScript = `([^`]+)`;/)?.[1];
  assert.ok(script);
  assert.equal(
    createHash('sha1').update(script).digest('hex'),
    slidingWindowSha
  );
});

test('the local read and pipeline envelopes match Upstash REST', async () => {
  const fixture = createResponsePolicyRedisFixture();
  assert.deepEqual(await (await send(fixture)).json(), { result: null });
  assert.deepEqual(
    await (await send(fixture, read, 'https://redis.invalid', true)).json(),
    [{ result: null }]
  );
  assert.deepEqual(
    await (await send(fixture, ['get', 'ip:blocked:127.0.0.1'])).json(),
    { result: null }
  );
  assert.deepEqual(
    await (
      await send(fixture, [
        'mget',
        'trust:mult:cidr:127.0.0.0/24',
        'trust:mult:ip:127.0.0.1',
      ])
    ).json(),
    { result: [null, null] }
  );
  fixture.assertRequests();
});

for (const [window, limit, duration] of [
  ['minute', 60, 60000],
  ['hour', 240, 3600000],
  ['day', 1200, 86400000],
]) {
  test(`the ${window} counter uses the declared threshold and increments per test`, async () => {
    const fixture = createResponsePolicyRedisFixture();
    const command = bucket(window, limit, duration);
    assert.deepEqual(await (await send(fixture, command)).json(), {
      result: [limit - 1, limit],
    });
    assert.deepEqual(await (await send(fixture, command)).json(), {
      result: [limit - 2, limit],
    });
    fixture.assertRequests();
    const fresh = createResponsePolicyRedisFixture();
    assert.deepEqual(await (await send(fresh, command)).json(), {
      result: [limit - 1, limit],
    });
    fresh.assertRequests();
  });
}

test('the seeded minute overflow returns the shipped script rejection', async () => {
  const fixture = createResponsePolicyRedisFixture({ minuteOverflow: true });
  assert.deepEqual(await (await send(fixture, bucket())).json(), {
    result: [-1, 60],
  });
  assert.deepEqual(Object.values(fixture.assertRequests().counters), [61]);
});

test('unavailability returns an error without mutating synthetic counters', async () => {
  const fixture = createResponsePolicyRedisFixture({ unavailable: true });
  assert.equal((await send(fixture)).status, 503);
  assert.equal((await send(fixture, bucket())).status, 503);
  assert.deepEqual(fixture.assertRequests().counters, {});
});

for (const [name, command, host] of [
  ['another origin', read, 'https://other.invalid'],
  ['a lookalike host', read, 'https://redis.invalid.attacker.invalid'],
  ['an unrelated write', ['set', 'key', 'value']],
  ['another read key', ['get', 'other']],
  ['a different script', ['evalsha', '0'.repeat(40), ...bucket().slice(2)]],
  ['a different key', [...bucket().slice(0, 3), 'other', ...bucket().slice(4)]],
  [
    'a different threshold',
    [...bucket().slice(0, 5), 61, ...bucket().slice(6)],
  ],
]) {
  test(`the audit rejects ${name} even if a caller swallows the denial`, async () => {
    const fixture = createResponsePolicyRedisFixture();
    assert.equal((await send(fixture, command, host)).status, 599);
    assert.throws(() => fixture.assertRequests());
  });
}

test('the audit rejects a seventh call in one HTTP request', async () => {
  const fixture = createResponsePolicyRedisFixture();
  const finish = fixture.beginRequest();
  try {
    for (let index = 0; index < 6; index++)
      await fixture.outbound(
        new Request('https://redis.invalid', {
          method: 'POST',
          body: JSON.stringify(read),
        })
      );
    assert.equal(
      (
        await fixture.outbound(
          new Request('https://redis.invalid', {
            method: 'POST',
            body: JSON.stringify(read),
          })
        )
      ).status,
      599
    );
  } finally {
    finish();
  }
  assert.throws(() => fixture.assertRequests());
});
