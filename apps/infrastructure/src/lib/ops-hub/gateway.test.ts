// @vitest-environment node
import { ASSERTION_HEADER, verifyAssertion } from '@tuturuuu/ops-hub/protocol';
import { beforeEach, expect, it, vi } from 'vitest';
import { forwardOpsHubRequest, GATEWAY_PREFIX } from './gateway';

const user = '11111111-1111-4111-8111-111111111111';
const gatewaySecret = 'test-only-key-long-enough-for-43-character-minimum';
const config = () => ({
  workerUrl: 'https://ops-fixture.account.workers.dev',
  gatewaySecret,
  allowedUserIds: user,
});
const authorize = vi.fn<() => Promise<string | null>>();
const upstream = vi.fn<typeof fetch>();
const request = (path = '/status', init?: RequestInit) =>
  new Request(
    `https://infrastructure.tuturuuu.com${GATEWAY_PREFIX}${path}`,
    init
  );
beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue(user);
  upstream.mockResolvedValue(
    Response.json(
      { enabled: true },
      { headers: { 'Set-Cookie': 'must-not-forward=yes' } }
    )
  );
});
it('returns 404 for non-admins and does not load configuration or forward', async () => {
  authorize.mockResolvedValue(null);
  const load = vi.fn(config);
  expect(
    (
      await forwardOpsHubRequest(request(), {
        authorize,
        config: load,
        fetch: upstream,
      })
    ).status
  ).toBe(404);
  expect(load).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
});
it('returns 404 for an admin outside the strict allowlist', async () => {
  authorize.mockResolvedValue('22222222-2222-4222-8222-222222222222');
  expect(
    (
      await forwardOpsHubRequest(request(), {
        authorize,
        config,
        fetch: upstream,
      })
    ).status
  ).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
it('forwards allowlisted admins with a fresh target-bound assertion and strips credentials', async () => {
  const response = await forwardOpsHubRequest(
    request('/events?after=4', {
      headers: {
        Authorization: 'Bearer private-session',
        Cookie: 'private-cookie=yes',
        [ASSERTION_HEADER]: 'caller-forgery',
      },
    }),
    { authorize, config, fetch: upstream }
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ enabled: true });
  expect(response.headers.get('set-cookie')).toBeNull();
  const [url, init] = upstream.mock.calls[0]!;
  expect(url).toBe('https://ops-fixture.account.workers.dev/events?after=4');
  const headers = new Headers(init?.headers);
  expect(headers.get('authorization')).toBeNull();
  expect(headers.get('cookie')).toBeNull();
  const assertion = headers.get(ASSERTION_HEADER)!;
  expect(
    await verifyAssertion(gatewaySecret, assertion, 'GET', '/events?after=4')
  ).toBe(user);
  expect(
    await verifyAssertion(
      gatewaySecret,
      assertion,
      'GET',
      '/events?after=4',
      Date.now() + 61_000
    )
  ).toBeNull();
  expect(init?.redirect).toBe('manual');
});
it.each([
  '/ingest',
  '/outbox',
  '/events?after=-1',
  '/status?redirect=1',
  '//attacker.invalid',
])('rejects unadmitted route %s', async (path) => {
  expect(
    (
      await forwardOpsHubRequest(request(path), {
        authorize,
        config,
        fetch: upstream,
      })
    ).status
  ).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
it('requires same-origin confirmation for cookie-authenticated erasure', async () => {
  expect(
    (
      await forwardOpsHubRequest(request('/hub', { method: 'DELETE' }), {
        authorize,
        config,
        fetch: upstream,
      })
    ).status
  ).toBe(404);
  expect(
    (
      await forwardOpsHubRequest(
        request('/hub', {
          method: 'DELETE',
          headers: { Origin: 'https://infrastructure.tuturuuu.com' },
        }),
        { authorize, config, fetch: upstream }
      )
    ).status
  ).toBe(200);
});
it('refuses redirects, non-JSON, unsafe origins and oversized responses', async () => {
  for (const response of [
    new Response(null, {
      status: 302,
      headers: { Location: 'https://other.invalid' },
    }),
    new Response('html', { headers: { 'Content-Type': 'text/html' } }),
  ]) {
    upstream.mockResolvedValueOnce(response);
    expect(
      (
        await forwardOpsHubRequest(request(), {
          authorize,
          config,
          fetch: upstream,
        })
      ).status
    ).toBe(502);
  }
  upstream.mockResolvedValueOnce(Response.json('x'.repeat(2 * 1024 * 1024)));
  expect(
    (
      await forwardOpsHubRequest(request(), {
        authorize,
        config,
        fetch: upstream,
      })
    ).status
  ).toBe(503);
  for (const workerUrl of [
    'http://ops.account.workers.dev',
    'https://attacker.invalid',
    'https://ops.account.workers.dev/private',
  ]) {
    expect(
      (
        await forwardOpsHubRequest(request(), {
          authorize,
          config: () => ({ ...config(), workerUrl }),
          fetch: upstream,
        })
      ).status
    ).toBe(503);
  }
});

it.each([
  '/decisions?after=0&category=auto',
  '/observability?since=0&series=children_series',
  '/hub/export?section=metrics&after=0&seq=1',
])(
  'forwards the v2 read contract %s with a target-bound assertion',
  async (target) => {
    const response = await forwardOpsHubRequest(request(target), {
      authorize,
      config,
      fetch: upstream,
    });
    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe(config().workerUrl + target);
    const assertion = new Headers(init?.headers).get(ASSERTION_HEADER)!;
    expect(await verifyAssertion(gatewaySecret, assertion, 'GET', target)).toBe(
      user
    );
  }
);
it.each(['/decisions?category=unknown', '/observability?series=unknown'])(
  'conceals invalid v2 query %s',
  async (target) => {
    expect(
      (
        await forwardOpsHubRequest(request(target), {
          authorize,
          config,
          fetch: upstream,
        })
      ).status
    ).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  }
);
