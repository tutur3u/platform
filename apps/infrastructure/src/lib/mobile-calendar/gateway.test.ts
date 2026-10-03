// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  forwardCalendarRequest,
  GATEWAY_HEADER,
  GATEWAY_PREFIX,
} from './gateway';

const secret = 'server-only-test-credential-'.padEnd(43, 'x');
const events = '/api/v1/workspaces/personal/calendar/events';
function request(path = events, init: RequestInit = {}) {
  return new Request(
    `https://infrastructure.tuturuuu.com${GATEWAY_PREFIX}${path}`,
    {
      ...init,
      headers: { Authorization: 'Bearer valid-session', ...init.headers },
    }
  );
}
function dependencies() {
  return {
    verifyToken: vi.fn(async () => true),
    loadSecret: vi.fn(async () => secret),
    fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [] })),
  };
}

describe('authenticated native Calendar gateway', () => {
  it('forwards the exact color options GET and preserves its source query', async () => {
    const deps = dependencies();
    const path =
      '/api/v1/workspaces/personal/calendar/colors?connectionId=source-id';
    const response = await forwardCalendarRequest(request(path), deps);
    expect(response.status).toBe(200);
    expect(deps.fetch.mock.calls[0]?.[0]).toBe(
      `https://calendar.tuturuuu.com${path}`
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('forwards actor-authenticated source mapping GET to the Calendar owner', async () => {
    const deps = dependencies();
    const path = '/api/v1/workspaces/personal/calendar/default-source';
    expect((await forwardCalendarRequest(request(path), deps)).status).toBe(
      200
    );
    expect(deps.verifyToken).toHaveBeenCalledWith('valid-session');
    expect(deps.fetch.mock.calls[0]?.[0]).toBe(
      `https://calendar.tuturuuu.com${path}`
    );
  });

  it.each(
    ['colors', 'default-source'].flatMap((resource) =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].map((method) => [resource, method])
    )
  )(
    'rejects readonly Calendar %s mutation %s before auth or forwarding',
    async (resource, method) => {
      const deps = dependencies();
      const response = await forwardCalendarRequest(
        request(`/api/v1/workspaces/personal/calendar/${resource}`, { method }),
        deps
      );
      expect(response.status).toBe(405);
      expect(deps.verifyToken).not.toHaveBeenCalled();
      expect(deps.loadSecret).not.toHaveBeenCalled();
      expect(deps.fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['/api/v1/users/calendar-settings', 'GET'],
    ['/api/v1/users/calendar-settings', 'PATCH'],
    ['/api/v1/workspaces/workspace-1/calendar-settings', 'GET'],
    ['/api/v1/workspaces/workspace-1/calendar-settings', 'PATCH'],
  ])(
    'forwards verified settings %s %s to the Calendar owner',
    async (path, method) => {
      const deps = dependencies();
      const init =
        method === 'PATCH'
          ? {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ timezone: 'Asia/Ho_Chi_Minh' }),
            }
          : { method };
      expect(
        (await forwardCalendarRequest(request(path, init), deps)).status
      ).toBe(200);
      const [url, options] = deps.fetch.mock.calls[0]!;
      expect(url).toBe(`https://calendar.tuturuuu.com${path}`);
      expect(options?.method).toBe(method);
      expect(deps.verifyToken).toHaveBeenCalledWith('valid-session');
    }
  );

  it.each([
    '/api/v1/users/calendar-settings',
    '/api/v1/workspaces/workspace-1/calendar-settings',
  ])('requires verified authentication for settings %s', async (path) => {
    const deps = dependencies();
    deps.verifyToken.mockResolvedValue(false);
    expect((await forwardCalendarRequest(request(path), deps)).status).toBe(
      401
    );
    expect(deps.loadSecret).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'DELETE'])(
    'rejects unsupported settings method %s',
    async (method) => {
      const deps = dependencies();
      expect(
        (
          await forwardCalendarRequest(
            request('/api/v1/users/calendar-settings', { method }),
            deps
          )
        ).status
      ).toBe(405);
      expect(deps.verifyToken).not.toHaveBeenCalled();
      expect(deps.fetch).not.toHaveBeenCalled();
    }
  );

  it.each(['', 'Bearer invalid', 'Basic valid', 'Bearer one two'])(
    'never accesses the credential or upstream for invalid auth: %s',
    async (auth) => {
      const deps = dependencies();
      deps.verifyToken.mockResolvedValue(false);
      const response = await forwardCalendarRequest(
        request(events, {
          headers: { Authorization: auth, [GATEWAY_HEADER]: secret },
        }),
        deps
      );
      expect(response.status).toBe(401);
      expect(deps.loadSecret).not.toHaveBeenCalled();
      expect(deps.fetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    '/api/v1/calendar/auth/callback',
    '/api/v1/calendar/media',
    '/api/v1/calendar/ai',
    '/api/v1/workspaces/ws/tasks',
    '/api/v1/workspaces/ws%2f..%2fcalendar/calendar/events',
    '//attacker.example/api/v1/calendar/connections',
  ])('rejects non-allowlisted route %s', async (path) => {
    const deps = dependencies();
    expect((await forwardCalendarRequest(request(path), deps)).status).toBe(
      404
    );
    expect(deps.verifyToken).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('forwards only verified auth and its own credential to a fixed origin', async () => {
    const deps = dependencies();
    const response = await forwardCalendarRequest(
      request(`${events}?start_at=2026-09-18`, {
        headers: {
          [GATEWAY_HEADER]: 'forged',
          Cookie: 'session=attacker',
          'x-forwarded-host': 'attacker.example',
        },
      }),
      deps
    );
    expect(response.status).toBe(200);
    expect(deps.verifyToken).toHaveBeenCalledWith('valid-session');
    expect(deps.verifyToken.mock.invocationCallOrder[0]).toBeLessThan(
      deps.loadSecret.mock.invocationCallOrder[0]!
    );
    const [url, options] = deps.fetch.mock.calls[0]!;
    expect(url).toBe(
      `https://calendar.tuturuuu.com${events}?start_at=2026-09-18`
    );
    const headers = new Headers(options?.headers);
    expect(headers.get(GATEWAY_HEADER)).toBe(secret);
    expect(headers.get('authorization')).toBe('Bearer valid-session');
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('x-forwarded-host')).toBe(false);
    expect(options?.redirect).toBe('manual');
    expect(options?.cache).toBe('no-store');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.has(GATEWAY_HEADER)).toBe(false);
  });

  it('preserves workspace denial and rate limit responses without session cookies', async () => {
    for (const status of [401, 403, 429]) {
      const deps = dependencies();
      deps.fetch.mockResolvedValue(
        Response.json(
          { message: 'Denied' },
          {
            status,
            headers: {
              'Set-Cookie': 'private=value',
              'Retry-After': '60',
              [GATEWAY_HEADER]: secret,
            },
          }
        )
      );
      const response = await forwardCalendarRequest(request(), deps);
      expect(response.status).toBe(status);
      expect(response.headers.get('retry-after')).toBe('60');
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(response.headers.has(GATEWAY_HEADER)).toBe(false);
    }
  });

  it.each([403, 429])(
    'relays only safe scalar rate/challenge diagnostics (%s)',
    async (status) => {
      const deps = dependencies();
      const safe = {
        'Retry-After': 'Thu, 01 Oct 2026 00:00:30 GMT',
        'X-Proxy-Block-Reason': 'route-rate-limit',
        'X-RateLimit-Policy': 'workspace-dashboard-read',
        'X-RateLimit-Caller-Class': 'authenticated',
        'X-RateLimit-Window': 'minute',
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1790812830',
        'X-Abuse-Challenge': 'turnstile',
      };
      deps.fetch.mockResolvedValue(
        Response.json(
          { message: 'Limited' },
          {
            status,
            headers: {
              ...safe,
              'Set-Cookie': 'private=value',
              Authorization: 'Bearer upstream-credential',
              [GATEWAY_HEADER]: secret,
              Location: 'https://private.example',
              'X-Upstream-Debug': 'private diagnostic',
              'Cache-Control': 'public, max-age=3600',
            },
          }
        )
      );
      const response = await forwardCalendarRequest(
        request('/api/v1/users/calendar-settings'),
        deps
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ message: 'Limited' });
      for (const [name, value] of Object.entries(safe))
        expect(response.headers.get(name)).toBe(value);
      for (const name of [
        'set-cookie',
        'authorization',
        GATEWAY_HEADER,
        'location',
        'x-upstream-debug',
      ])
        expect(response.headers.has(name)).toBe(false);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(deps.fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('omits oversized or malformed diagnostics and does not expand the allowlist', async () => {
    const deps = dependencies();
    deps.fetch.mockResolvedValue(
      Response.json(
        {},
        {
          status: 429,
          headers: {
            'X-RateLimit-Policy': 'x'.repeat(97),
            'X-RateLimit-Limit': 'private value',
            'X-Abuse-Challenge': 'https://attacker.example',
            'Retry-After': 'x'.repeat(129),
            'X-RateLimit-Secret': secret,
          },
        }
      )
    );
    const response = await forwardCalendarRequest(request(), deps);
    expect(response.status).toBe(429);
    expect([...response.headers.keys()].sort()).toEqual([
      'cache-control',
      'content-type',
    ]);
  });

  it('forwards JSON mutations once and does not retry failures', async () => {
    const deps = dependencies();
    const body = JSON.stringify({ title: 'Meeting' });
    const response = await forwardCalendarRequest(
      request(events, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      }),
      deps
    );
    expect(response.status).toBe(200);
    expect(
      new TextDecoder().decode(deps.fetch.mock.calls[0]![1]?.body as Uint8Array)
    ).toBe(body);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    deps.fetch.mockRejectedValue(new Error(`Do not leak ${secret}`));
    const failed = await forwardCalendarRequest(request(), deps);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain(secret);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    new Response(null, {
      status: 307,
      headers: { Location: 'https://attacker.example' },
    }),
    new Response('<html>challenge</html>', {
      status: 429,
      headers: { 'Content-Type': 'text/html' },
    }),
  ])('blocks redirects and non-JSON upstream responses', async (upstream) => {
    const deps = dependencies();
    deps.fetch.mockResolvedValue(upstream);
    expect((await forwardCalendarRequest(request(), deps)).status).toBe(502);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed on missing or unreadable credentials', async () => {
    const deps = dependencies();
    deps.loadSecret.mockResolvedValue('');
    expect((await forwardCalendarRequest(request(), deps)).status).toBe(503);
    deps.loadSecret.mockRejectedValue(new Error('Secret store unavailable'));
    expect((await forwardCalendarRequest(request(), deps)).status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('enforces method, body type and byte limits', async () => {
    const deps = dependencies();
    expect(
      (await forwardCalendarRequest(request(events, { method: 'PATCH' }), deps))
        .status
    ).toBe(405);
    expect(
      (
        await forwardCalendarRequest(
          request(events, {
            method: 'POST',
            body: 'text',
          }),
          deps
        )
      ).status
    ).toBe(415);
    expect(
      (
        await forwardCalendarRequest(
          request(events, {
            method: 'POST',
            body: 'x'.repeat(512 * 1024 + 1),
            headers: { 'Content-Type': 'application/json' },
          }),
          deps
        )
      ).status
    ).toBe(413);
    expect(deps.fetch).not.toHaveBeenCalled();
    deps.fetch.mockResolvedValue(
      new Response('x'.repeat(8 * 1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect((await forwardCalendarRequest(request(), deps)).status).toBe(502);
  });
});

it('forwards only authenticated POST requests to meeting responses', async () => {
  const deps = dependencies();
  const path = `${events}/event-id/response`;
  const response = await forwardCalendarRequest(
    request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"response":"accepted"}',
    }),
    deps
  );
  expect(response.status).toBe(200);
  expect(deps.verifyToken).toHaveBeenCalled();
  expect(deps.fetch).toHaveBeenCalledTimes(1);
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const blocked = await forwardCalendarRequest(
      request(path, { method }),
      deps
    );
    expect(blocked.status).toBeGreaterThanOrEqual(400);
  }
  expect(deps.fetch).toHaveBeenCalledTimes(1);
});
