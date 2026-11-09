import assert from 'node:assert/strict';

// SHA1 of @upstash/ratelimit's shipped slidingWindowLimitScript.
export const slidingWindowSha = '74740bb3d7792848093cdef586b6b6037c455fd6';
const controlsKey = 'infrastructure:edge-abuse-protection-controls';
const windows = {
  minute: [60, 60000],
  hour: [240, 3600000],
  day: [1200, 86400000],
};
const bucketPrefix = 'proxy:inventory:api:default:anonymous:get:';

export function createResponsePolicyRedisFixture({
  unavailable = false,
  minuteOverflow = false,
} = {}) {
  const requests = [];
  const calls = [];
  const violations = [];
  const otherEgress = [];
  const counters = new Map();
  let active = null;
  let totalCalls = 0;

  function answer(command) {
    if (command[0] === 'get') {
      assert.ok(
        command.length === 2 &&
          [controlsKey, 'ip:blocked:127.0.0.1'].includes(command[1]),
        'Unexpected GET key'
      );
      return null;
    }
    if (command[0] === 'mget') {
      assert.deepEqual(command, [
        'mget',
        'trust:mult:cidr:127.0.0.0/24',
        'trust:mult:ip:127.0.0.1',
      ]);
      return [null, null];
    }
    assert.equal(command[0], 'evalsha', 'Unexpected Redis command');
    assert.equal(command.length, 9);
    const [
      ,
      sha,
      keyCount,
      currentKey,
      previousKey,
      limit,
      now,
      duration,
      increment,
    ] = command;
    assert.equal(sha, slidingWindowSha, 'Unexpected rate-limit script SHA');
    assert.equal(keyCount, 2);
    assert.equal(increment, 1);
    assert.ok(Number.isSafeInteger(now) && Math.abs(Date.now() - now) < 30000);
    const match = currentKey.match(
      /^proxy:inventory:api:default:anonymous:get:(minute|hour|day):ip:127\.0\.0\.1:(\d+)$/
    );
    assert.ok(match, 'Unexpected rate-limit key');
    const window = match[1];
    assert.deepEqual(
      [limit, duration],
      windows[window],
      'Rate-limit thresholds must match the guard'
    );
    const bucket = Math.floor(now / duration);
    assert.equal(currentKey, `${bucketPrefix}${window}:ip:127.0.0.1:${bucket}`);
    assert.equal(
      previousKey,
      `${bucketPrefix}${window}:ip:127.0.0.1:${bucket - 1}`
    );
    // The unavailable store has no synthetic state mutation.
    if (unavailable) return null;
    const current =
      counters.get(currentKey) ??
      (minuteOverflow && window === 'minute' ? limit + 1 : 0);
    if (minuteOverflow && window === 'minute' && !counters.has(currentKey))
      counters.set(currentKey, current);
    const previous = Math.floor(
      (1 - (now % duration) / duration) * (counters.get(previousKey) ?? 0)
    );
    if (current + previous >= limit) return [-1, limit];
    counters.set(currentKey, current + increment);
    assert.ok(counters.size <= 6, 'Synthetic counter budget');
    return [limit - (current + increment + previous), limit];
  }

  return {
    beginRequest() {
      assert.equal(active, null, 'Fixture requests must be sequential');
      assert.ok(requests.length < 32, 'HTTP request budget');
      const record = { index: requests.length, calls: [] };
      requests.push(record);
      active = record;
      return () => {
        active = null;
      };
    },
    async outbound(request) {
      const url = new URL(request.url);
      const call = {
        origin: url.origin,
        path: url.pathname,
        method: request.method,
      };
      calls.push(call);
      totalCalls++;
      active?.calls.push(call);
      try {
        if (url.origin !== 'https://redis.invalid')
          otherEgress.push(url.origin);
        assert.ok(active, 'No outbound call outside an owned HTTP request');
        assert.ok(
          active.calls.length <= 6,
          'Redis calls per HTTP request budget'
        );
        assert.ok(totalCalls <= 32, 'Total Redis call budget');
        assert.equal(url.origin, 'https://redis.invalid');
        assert.equal(url.username + url.password + url.search, '');
        assert.equal(request.method, 'POST');
        assert.ok(url.pathname === '/' || url.pathname === '/pipeline');
        const body = await request.text();
        assert.ok(body.length <= 1024, 'Redis command size budget');
        const parsed = JSON.parse(body);
        const commands = url.pathname === '/pipeline' ? parsed : [parsed];
        assert.ok(
          Array.isArray(commands) && commands.length === 1,
          'One command per mock call'
        );
        call.commands = commands;
        const result = { result: answer(commands[0]) };
        if (unavailable) {
          call.status = 503;
          return Response.json(
            { error: 'Synthetic Redis unavailable' },
            { status: 503 }
          );
        }
        call.status = 200;
        return Response.json(url.pathname === '/pipeline' ? [result] : result);
      } catch (error) {
        violations.push(error.message);
        call.status = 599;
        return new Response('Fixture egress denied', { status: 599 });
      }
    },
    assertRequests() {
      assert.equal(active, null);
      assert.deepEqual(
        otherEgress,
        [],
        'No outbound requests to any unmocked host'
      );
      assert.deepEqual(
        violations,
        [],
        'Every Redis call must obey the exact local dependency contract'
      );
      assert.ok(totalCalls > 0 && totalCalls <= 32);
      return {
        unavailable,
        minuteOverflow,
        requests,
        calls,
        counters: Object.fromEntries(counters),
      };
    },
  };
}
