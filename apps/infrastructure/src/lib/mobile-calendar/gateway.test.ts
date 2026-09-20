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
