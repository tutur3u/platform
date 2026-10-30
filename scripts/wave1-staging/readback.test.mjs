import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fixtureAppIds,
  fixtureStaffGroupId,
  fixtureZoneId,
  healthyTopology,
  topologyResponse,
} from '../ci/wave1-ingress-fixture.mjs';
import { readback } from './readback.mjs';

const sha = 'f'.repeat(40);
const env = {
  CLOUDFLARE_STAGING_API_TOKEN: 'read-fixture',
  CLOUDFLARE_STAGING_ACCOUNT_ID: 'e'.repeat(32),
  STAGING_TUTUR3U_ZONE_ID: fixtureZoneId,
  STAGING_ACCESS_APP_IDS: JSON.stringify(fixtureAppIds),
  STAGING_ACCESS_STAFF_GROUP_ID: fixtureStaffGroupId,
  CLOUDFLARE_WORKERS_SUBDOMAIN: 'owner-example',
  CF_ACCESS_HEALTH_CLIENT_ID: 'ci.access',
  CF_ACCESS_HEALTH_CLIENT_SECRET: 'ci-secret',
};
const nxdomain = {
  resolve: async () =>
    Promise.reject(Object.assign(new Error('x'), { code: 'ENOTFOUND' })),
};

function world(overrides = {}) {
  const topology = {
    web: healthyTopology('web'),
    calendar: healthyTopology('calendar'),
  };
  // Custom Domains are account-wide: one list holds both staging hosts.
  const domains = {
    ...topology.web.domains,
    result: [
      ...topology.web.domains.result,
      topology.calendar.domains.result[0],
    ],
  };
  topology.web.domains = domains;
  topology.calendar.domains = domains;
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
    });
    if (overrides.http) {
      const forced = overrides.http(u, init);
      if (forced) return forced;
    }
    if (u.hostname === 'api.cloudflare.com') {
      assert.equal(init.method ?? 'GET', 'GET', 'readback must never write');
      const app =
        url.includes('calendar') ||
        url.includes(fixtureAppIds['calendar.staging.tutur3u.com'])
          ? 'calendar'
          : 'web';
      if (u.pathname.endsWith('/deployments'))
        return Response.json({
          success: true,
          result: {
            deployments: [
              { versions: [{ version_id: 'v1', percentage: 100 }] },
            ],
          },
        });
      if (u.pathname.endsWith('/versions/v1'))
        return Response.json({
          success: true,
          result: { annotations: { 'workers/message': sha } },
        });
      if (u.pathname.endsWith('/subdomain'))
        return Response.json(topology[app].subdomain);
      return Response.json(topologyResponse(u, topology[app]));
    }
    if (u.hostname.endsWith('.workers.dev'))
      return new Response('nothing here', { status: 404 });
    const headers = new Headers(init.headers);
    if (headers.get('cf-access-client-id') === env.CF_ACCESS_HEALTH_CLIENT_ID)
      return Response.json({
        commitHash: sha,
        environment: 'staging',
        appName: 'x',
      });
    if (init.method === 'OPTIONS' && u.hostname === 'web.staging.tutur3u.com')
      return new Response(null, { status: 204 });
    return new Response(null, {
      status: 302,
      headers: {
        location: 'https://tuturuuu.cloudflareaccess.com/cdn-cgi/access/login',
      },
    });
  };
  return { fetcher, calls };
}

test('a healthy Access-only topology reads back green with no provider writes', async () => {
  const { fetcher, calls } = world();
  const report = await readback({
    argv: ['--expect-sha', sha],
    env,
    fetcher,
    resolver: nxdomain,
  });
  assert.equal(
    report.ok,
    true,
    JSON.stringify(report.checks.filter((c) => !c.ok))
  );
  const ids = new Set(report.checks.map((c) => c.id));
  for (const id of [
    'R1/R2/N10-records/Access',
    'R3',
    'R4',
    'N1',
    'N2',
    'N3',
    'N4',
    'N5',
    'N10',
  ])
    assert.ok(ids.has(id), id);
  // Only the R4 probes carry a credential, and never a staff identity.
  for (const call of calls.filter(
    (c) => new URL(c.url).origin !== 'https://api.cloudflare.com'
  ))
    assert.equal(
      call.headers.has('cookie') &&
        !call.headers.get('cookie').startsWith('CF_Authorization='),
      false
    );
});

const failing = [
  [
    'an anonymous 200 (N1)',
    (u, i) =>
      u.hostname === 'web.staging.tutur3u.com' &&
      !i.method &&
      !new Headers(i.headers).has('cf-access-client-id')
        ? new Response('open')
        : null,
    'N1',
  ],
  [
    'a served Calendar OPTIONS (N3)',
    (u, i) =>
      u.hostname === 'calendar.staging.tutur3u.com' && i.method === 'OPTIONS'
        ? new Response(null, { status: 204 })
        : null,
    'N3',
  ],
  [
    'an issuer OPTIONS with a body (N3)',
    (u, i) =>
      u.hostname === 'web.staging.tutur3u.com' && i.method === 'OPTIONS'
        ? new Response('data', { status: 204 })
        : null,
    'N3',
  ],
  [
    'a forged assertion accepted (N4)',
    (_u, i) =>
      new Headers(i.headers).has('cf-access-jwt-assertion')
        ? new Response('ok')
        : null,
    'N4',
  ],
  [
    'a live workers.dev URL (N5)',
    (u) =>
      u.hostname.endsWith('.workers.dev') ? new Response('worker') : null,
    'N5',
  ],
  [
    'a stale build (R4)',
    (_u, i) =>
      new Headers(i.headers).has('cf-access-client-id')
        ? Response.json({ commitHash: '0'.repeat(40), environment: 'staging' })
        : null,
    'R4',
  ],
];
for (const [label, http, id] of failing)
  test(`readback fails on ${label}`, async () => {
    const { fetcher } = world({ http });
    const report = await readback({
      argv: ['--expect-sha', sha],
      env,
      fetcher,
      resolver: nxdomain,
    });
    assert.equal(report.ok, false);
    assert.ok(
      report.checks.some((c) => c.id === id && !c.ok),
      id
    );
  });

test('readback fails when an unknown staging sibling resolves (N10 live DNS)', async () => {
  const { fetcher } = world();
  const report = await readback({
    env,
    fetcher,
    resolver: { resolve: async () => ['192.0.2.1'] },
  });
  assert.ok(report.checks.some((c) => c.id === 'N10' && !c.ok));
});

test('readback fails closed when a topology read errors or credentials are missing', async () => {
  const { fetcher } = world({
    http: (u) =>
      u.pathname.endsWith('/workers/domains')
        ? new Response('denied', { status: 403 })
        : null,
  });
  const report = await readback({
    argv: ['--app', 'web'],
    env,
    fetcher,
    resolver: nxdomain,
  });
  assert.ok(
    report.checks.some((c) => c.id === 'R1/R2/N10-records/Access' && !c.ok)
  );
  await assert.rejects(
    readback({
      env: { ...env, CLOUDFLARE_STAGING_API_TOKEN: '' },
      fetcher,
      resolver: nxdomain,
    })
  );
  await assert.rejects(
    readback({ argv: ['--app', 'mail'], env, fetcher, resolver: nxdomain }),
    /No ingress-admitted/
  );
});
