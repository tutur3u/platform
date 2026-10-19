import assert from 'node:assert/strict';

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

export function fixtureEgress(fixtureOrigin, userId, signal, fetcher = fetch) {
  const origin = new URL(fixtureOrigin);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  assert.equal(origin.pathname, '/');
  assert.equal(origin.search, '');
  assert.equal(origin.hash, '');
  assert.equal(origin.username + origin.password, '');
  const unexpected = [];
  const permitted = [];
  const outboundService = async (request) => {
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
    permitted.push({ method: request.method, url: request.url });
    return fetcher(request.url, {
      method: request.method,
      headers: [...request.headers],
      body: ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      redirect: 'manual',
      signal,
    });
  };
  return { outboundService, unexpected, permitted };
}
