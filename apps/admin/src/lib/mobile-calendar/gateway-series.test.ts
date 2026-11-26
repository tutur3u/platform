// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { forwardCalendarRequest, GATEWAY_PREFIX } from './gateway';
import { calendarGatewayRoute } from './gateway-route';

const secret = 'server-only-test-credential-'.padEnd(43, 'x');
const series = '/api/v1/workspaces/personal/calendar/series';
const seriesId = '6f1f6b2e-8a52-4d47-9b0e-3f4c2a1d9e7b';
const one = `${series}/${seriesId}`;

function request(path: string, init: RequestInit = {}, auth = true) {
  return new Request(
    `https://infrastructure.tuturuuu.com${GATEWAY_PREFIX}${path}`,
    {
      ...init,
      headers: {
        ...(auth ? { Authorization: 'Bearer valid-session' } : {}),
        ...init.headers,
      },
    }
  );
}

function dependencies() {
  return {
    verifyToken: vi.fn(async () => true),
    loadSecret: vi.fn(async () => secret),
    fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json({})),
  };
}

const json = { 'Content-Type': 'application/json' };

describe('native recurring series through the Calendar gateway', () => {
  it('allows each series entry only with its listed methods', () => {
    expect(calendarGatewayRoute(`${GATEWAY_PREFIX}${series}`)?.methods).toEqual(
      ['GET', 'POST']
    );
    expect(calendarGatewayRoute(`${GATEWAY_PREFIX}${one}`)?.methods).toEqual([
      'GET',
      'PUT',
      'DELETE',
    ]);
  });

  it('forwards the listed methods once to the fixed Calendar origin', async () => {
    const cases: [string, string, boolean][] = [
      [
        `${series}?from=2026-11-01T00:00:00.000Z&to=2026-12-01T00:00:00.000Z`,
        'GET',
        false,
      ],
      [series, 'POST', true],
      [one, 'GET', false],
      [one, 'PUT', true],
      [one, 'DELETE', true],
    ];
    for (const [path, method, body] of cases) {
      const deps = dependencies();
      const response = await forwardCalendarRequest(
        request(path, {
          method,
          ...(body ? { body: '{"requestId":"r"}', headers: json } : {}),
        }),
        deps
      );
      expect(response.status, `${method} ${path}`).toBe(200);
      expect(deps.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = deps.fetch.mock.calls[0]!;
      expect(url).toBe(`https://calendar.tuturuuu.com${path}`);
      expect(init?.method).toBe(method);
    }
  });

  it('blocks every other method on the series entries', async () => {
    for (const [path, methods] of [
      [series, ['PUT', 'PATCH', 'DELETE']],
      [one, ['POST', 'PATCH']],
    ] as const) {
      for (const method of methods) {
        const deps = dependencies();
        const response = await forwardCalendarRequest(
          request(path, { method }),
          deps
        );
        expect(response.status, `${method} ${path}`).toBe(405);
        expect(deps.fetch).not.toHaveBeenCalled();
      }
    }
  });

  it.each([
    ['an extra trailing segment', `${one}/exceptions`],
    ['a trailing slash', `${series}/`],
    ['a non-UUID series id', `${series}/not-a-uuid`],
    ['the provider operations route', `${series}/provider-operations`],
    ['a provider operation', `${series}/provider-operations/${seriesId}`],
    ['an encoded slash', `${series}%2F${seriesId}`],
    ['an encoded slash inside the id', `${series}/${seriesId}%2Fx`],
    ['a dot segment', `${series}/../../../../users/calendar-settings/x`],
    ['an encoded dot segment', `${series}/%2e%2e/${seriesId}`],
  ])('keeps %s blocked', async (_, path) => {
    const deps = dependencies();
    const response = await forwardCalendarRequest(request(path), deps);
    expect(response.status).toBe(404);
    expect(deps.verifyToken).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('still answers 401 without a verified session', async () => {
    for (const path of [series, one]) {
      const missing = dependencies();
      expect(
        (await forwardCalendarRequest(request(path, {}, false), missing)).status
      ).toBe(401);
      expect(missing.loadSecret).not.toHaveBeenCalled();
      expect(missing.fetch).not.toHaveBeenCalled();

      const rejected = dependencies();
      rejected.verifyToken.mockResolvedValue(false);
      expect(
        (await forwardCalendarRequest(request(path), rejected)).status
      ).toBe(401);
      expect(rejected.fetch).not.toHaveBeenCalled();
    }
  });
});
