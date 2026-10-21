import assert from 'node:assert/strict';

const policies = new WeakMap();
// Four signed SSR/RPC/API paths, each bounded to eight fixture operations.
export const APPS_FIXTURE_MAX_OPERATIONS = 4 * 8;
export const APPS_FIXTURE_MAX_BODY = 16 * 1024;

export function assertNoRuntimeResources(config) {
  assert.deepEqual(config.durable_objects, { bindings: [] });
  for (const key of [
    'd1_databases',
    'kv_namespaces',
    'r2_buckets',
    'services',
    'workflows',
    'routes',
  ]) {
    assert.ok(
      config[key] === undefined ||
        (Array.isArray(config[key]) && config[key].length === 0),
      `Unadmitted resource or route: ${key}`
    );
  }
}

export function fixtureEgress(
  fixtureOrigin,
  userId,
  signal,
  fetcher = fetch,
  role = 'app'
) {
  const origin = new URL(fixtureOrigin);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  assert.equal(origin.pathname, '/');
  assert.equal(origin.search, '');
  assert.equal(origin.hash, '');
  assert.equal(origin.username + origin.password, '');
  assert.ok(['app', 'negative'].includes(role), 'Closed HTTP role');
  const unexpected = [];
  const permitted = [];
  let operations = 0;
  const outboundService = async (request) => {
    if (++operations > APPS_FIXTURE_MAX_OPERATIONS) {
      unexpected.push({ method: request.method, url: request.url });
      throw new Error('Fixture operation budget exceeded');
    }
    const url = new URL(request.url);
    const allowedPath =
      (request.method === 'GET' &&
        (url.pathname === '/auth/v1/user' ||
          url.pathname === `/auth/v1/admin/users/${userId}` ||
          url.pathname.startsWith('/rest/v1/') ||
          url.pathname === '/api/v1/users/me/profile')) ||
      (request.method === 'PATCH' &&
        url.pathname === '/api/v1/workspaces/other' &&
        url.search === '?tag=1&tag=2');
    if (
      url.origin !== origin.origin ||
      url.username ||
      url.password ||
      !allowedPath
    ) {
      unexpected.push({ method: request.method, url: request.url });
      return new Response('Fixture egress denied', { status: 599 });
    }
    let body;
    try {
      body = ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : await boundedBody(request);
    } catch (error) {
      unexpected.push({ method: request.method, url: request.url });
      throw error;
    }
    permitted.push({ method: request.method, url: request.url });
    return fetcher(request.url, {
      method: request.method,
      headers: [...request.headers],
      body,
      redirect: 'manual',
      signal,
    });
  };
  return registerPolicy(
    role,
    outboundService,
    unexpected,
    permitted,
    fetcher === fetch,
    'http',
    origin.origin
  );
}

async function boundedBody(request) {
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (!reader) return undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert.ok(size <= APPS_FIXTURE_MAX_BODY, 'Fixture body budget exceeded');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } catch (error) {
    await reader.cancel(error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function registerPolicy(
  role,
  outboundService,
  unexpected,
  permitted,
  trusted,
  mode,
  fixtureOrigin
) {
  const policy = Object.freeze({
    role,
    outboundService,
    unexpected,
    permitted,
  });
  policies.set(policy, { role, trusted, mode, fixtureOrigin });
  return policy;
}

export function browserEgress() {
  const unexpected = [];
  let operations = 0;
  return registerPolicy(
    'app',
    async (request) => {
      if (++operations > APPS_FIXTURE_MAX_OPERATIONS) {
        unexpected.push('operation budget exceeded');
        throw new Error('Fixture operation budget exceeded');
      }
      const url = new URL(request.url);
      unexpected.push(`${request.method} ${url.origin}${url.pathname}`);
      return new Response('Unexpected disposable-fixture egress', {
        status: 599,
      });
    },
    unexpected,
    [],
    true,
    'browser'
  );
}

export function admitAppsPolicies(mode, values, fixtureOrigin) {
  const roles =
    mode === 'http' ? ['app', 'negative'] : mode === 'browser' ? ['app'] : null;
  assert.ok(roles, 'Closed Apps mode');
  assert.deepEqual(
    Object.keys(values).sort(),
    roles.slice().sort(),
    'Closed policy roles'
  );
  assert.equal(
    new Set(Object.values(values)).size,
    roles.length,
    'Distinct role policies required'
  );
  for (const role of roles) {
    const policy = values[role],
      record = policies.get(policy);
    assert.equal(record?.role, role, 'Unadmitted role policy');
    assert.equal(record.mode, mode, 'Policy mode mismatch');
    if (mode === 'http' && fixtureOrigin !== undefined)
      assert.equal(
        record.fixtureOrigin,
        fixtureOrigin,
        'Fixture origin/policy mismatch'
      );
    assert.equal(
      record.trusted,
      true,
      'Injected policy fetchers are test-only'
    );
    assert.equal(Object.isFrozen(policy), true);
  }
  return roles;
}

// Exercise the exact production handler before startup without mixing its
// control events into the original compiled-handler negative assertion.
export async function controlAppsPolicies(mode, values) {
  const roles = admitAppsPolicies(mode, values);
  const controls = {};
  for (const role of roles) {
    const policy = values[role];
    assert.deepEqual(policy.unexpected, []);
    assert.deepEqual(policy.permitted, []);
    for (const url of [
      'https://unadmitted.invalid/control',
      'http://127.0.0.1:1/control',
    ]) {
      const response = await policy.outboundService(new Request(url));
      assert.equal(response.status, 599);
      assert.equal(
        await response.text(),
        mode === 'http'
          ? 'Fixture egress denied'
          : 'Unexpected disposable-fixture egress'
      );
    }
    assert.equal(policy.unexpected.length, 2);
    assert.deepEqual(policy.permitted, []);
    policy.unexpected.splice(0, 2);
    controls[role] = 2;
  }
  return controls;
}

export function appsPolicyReceipt(mode, values, controls) {
  const roles = admitAppsPolicies(mode, values);
  return Object.fromEntries(
    roles.map((role) => [
      role,
      {
        controls: controls[role],
        permitted: values[role].permitted.length,
        unexpected: values[role].unexpected.map((value) =>
          typeof value === 'string'
            ? value
            : {
                method: value.method,
                url: `${new URL(value.url).origin}${new URL(value.url).pathname}`,
              }
        ),
      },
    ])
  );
}
