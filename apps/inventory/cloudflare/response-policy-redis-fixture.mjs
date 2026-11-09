import assert from 'node:assert/strict';

const controlsKey = 'infrastructure:edge-abuse-protection-controls';

export function createResponsePolicyRedisFixture({ unavailable = false } = {}) {
  const requests = [];
  const violations = [];
  const otherEgress = [];
  const maxRequests = 4;

  return {
    async outbound(request) {
      const url = new URL(request.url);
      requests.push({
        origin: url.origin,
        path: url.pathname,
        method: request.method,
      });
      try {
        if (url.origin !== 'https://redis.invalid')
          otherEgress.push(url.origin);
        assert.equal(url.origin, 'https://redis.invalid');
        assert.equal(url.username + url.password + url.search, '');
        assert.ok(requests.length <= maxRequests, 'Redis request budget');
        assert.equal(request.method, 'POST');
        assert.ok(url.pathname === '/' || url.pathname === '/pipeline');
        const body = await request.text();
        assert.ok(body.length <= 1024, 'Redis command size budget');
        const parsed = JSON.parse(body);
        const commands = url.pathname === '/pipeline' ? parsed : [parsed];
        assert.deepEqual(
          commands,
          [['get', controlsKey]],
          'Only the abuse-controls read is permitted'
        );
        requests.at(-1).commands = commands;
        if (unavailable) {
          return Response.json(
            { error: 'Synthetic Redis unavailable' },
            { status: 503 }
          );
        }
        const result = { result: null };
        return Response.json(url.pathname === '/pipeline' ? [result] : result);
      } catch (error) {
        violations.push(error.message);
        return new Response('Fixture egress denied', { status: 599 });
      }
    },
    assertRequests() {
      assert.deepEqual(
        otherEgress,
        [],
        'No outbound requests to any unmocked host'
      );
      assert.deepEqual(
        violations,
        [],
        'All mocked Redis requests obey the read-only contract'
      );
      assert.ok(
        requests.length > 0,
        'The production abuse-controls dependency must be exercised'
      );
      assert.ok(requests.length <= maxRequests, 'Redis request budget');
      assert.ok(requests.every(({ commands }) => commands?.length === 1));
      return { unavailable, requests };
    },
  };
}
