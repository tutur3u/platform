import assert from 'node:assert/strict';

const policies = new WeakMap();
export const DENIAL = 'Unexpected fixture egress';
export const PROBE_NEGATIVES = 9;

async function boundedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 128) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(next.value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}

export function createMeetPolicy(role) {
  assert.ok(['app', 'probe'].includes(role), 'Unknown HTTP policy role');
  const forwarded = [],
    unexpected = [],
    controls = [];
  let expected,
    calls = 0;
  const handler = async (request) => {
    assert.ok(++calls <= 32, 'HTTP fixture operation bound exceeded');
    const url = new URL(request.url);
    const attempt = {
      role,
      method: request.method,
      origin: url.origin,
      path: url.pathname,
    };
    const cookie = request.headers.get('cookie') ?? '';
    if (
      role === 'app' &&
      forwarded.length === 0 &&
      request.method === 'POST' &&
      url.origin === 'https://tuturuuu.com' &&
      !url.username &&
      !url.password &&
      url.pathname === '/api/v1/meet-ci-rewrite' &&
      url.search === '?repeat=one&repeat=two' &&
      request.headers.get('content-type') === 'application/json' &&
      cookie.length <= 8192 &&
      /(?:^|;\s*)tuturuuu_app_session=ttr_app_[A-Za-z0-9_.-]+(?:;|$)/.test(
        cookie
      ) &&
      /(?:^|;\s*)tuturuuu_web_app_session=ttr_app_[A-Za-z0-9_.-]+(?:;|$)/.test(
        cookie
      )
    ) {
      const body = await boundedBody(request);
      if (body === '{"fixture":true}') {
        forwarded.push({
          method: request.method,
          query: url.search,
          cookie,
          body,
        });
        return Response.json(
          { fixture: 'central-web-api' },
          {
            status: 207,
            headers: {
              'set-cookie':
                'meet_ci_upstream=one; Path=/; HttpOnly; Secure; SameSite=Lax',
            },
          }
        );
      }
    }
    if (expected && JSON.stringify(attempt) === JSON.stringify(expected)) {
      controls.push(attempt);
      expected = undefined;
    } else unexpected.push(attempt);
    return new Response(DENIAL, { status: 599 });
  };
  const policy = Object.freeze({
    role,
    handler,
    forwarded,
    unexpected,
    controls,
    expectDenial(method, target) {
      assert.equal(expected, undefined, 'Unexercised HTTP denial control');
      const url = new URL(target);
      expected = { role, method, origin: url.origin, path: url.pathname };
    },
    assertControls(count) {
      assert.equal(expected, undefined, 'HTTP denial hook did not run');
      assert.equal(controls.length, count);
      assert.deepEqual(unexpected, []);
    },
  });
  policies.set(policy, { role, handler });
  return policy;
}

export function admitMeetPolicies(value) {
  assert.deepEqual(
    Object.keys(value).sort(),
    ['app', 'probe'],
    'Both role policies required'
  );
  for (const role of ['app', 'probe']) {
    const pin = policies.get(value[role]);
    assert.equal(pin?.role, role, 'Missing or wrong HTTP policy role');
    assert.equal(
      value[role].handler,
      pin.handler,
      'HTTP policy handler changed'
    );
  }
}
