// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { forwardCalendarRequest, GATEWAY_PREFIX } from './gateway';
import { calendarGatewayRoute } from './gateway-route';

const secret = 'server-only-test-credential-'.padEnd(43, 'x');
const eventId = '0b6f3c1e-4d2a-4c8b-9e7f-1a2b3c4d5e6f';
const event = `/api/v1/workspaces/personal/calendar/events/${eventId}`;
const attendees = `${event}/attendees`;
const guests = `${event}/guests`;
const guestId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const guest = `${guests}/${guestId}`;
const json = { 'Content-Type': 'application/json' };

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

describe('event guest routes through the Calendar gateway', () => {
  it('allows each guest entry only with its listed methods', () => {
    const methods = (path: string) =>
      calendarGatewayRoute(`${GATEWAY_PREFIX}${path}`)?.methods;
    expect(methods(attendees)).toEqual(['GET']);
    expect(methods(guests)).toEqual(['GET', 'POST']);
    expect(methods(guest)).toEqual(['DELETE']);
  });

  it('forwards the listed methods once to the fixed Calendar origin', async () => {
    const cases: [string, string, boolean][] = [
      [attendees, 'GET', false],
      [guests, 'GET', false],
      [guests, 'POST', true],
      [guest, 'DELETE', false],
    ];
    for (const [path, method, body] of cases) {
      const deps = dependencies();
      const response = await forwardCalendarRequest(
        request(path, {
          method,
          ...(body ? { body: '{"guests":[]}', headers: json } : {}),
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

  it.each([
    [attendees, ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']],
    [guests, ['PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']],
    [guest, ['GET', 'POST', 'PUT', 'PATCH', 'HEAD', 'OPTIONS']],
  ] as const)('answers other methods on %s with 405', async (path, methods) => {
    for (const method of methods) {
      const deps = dependencies();
      const response = await forwardCalendarRequest(
        request(path, { method }),
        deps
      );
      expect(response.status, `${method} ${path}`).toBe(405);
      expect(deps.verifyToken).not.toHaveBeenCalled();
      expect(deps.fetch).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['an extra trailing segment', `${attendees}/x`],
    ['a trailing slash', `${attendees}/`],
    [
      'a non-UUID event id',
      '/api/v1/workspaces/personal/calendar/events/x/attendees',
    ],
    ['an encoded slash', `${event}%2Fattendees`],
    ['an encoded slash inside the id', `${event}%2Fx/attendees`],
    ['a dot segment', `${attendees}/../x/y`],
    ['an encoded dot segment', `${attendees}/%2e%2e/x/y`],
    ['a guest list trailing segment', `${guest}/x`],
    ['a guest list trailing slash', `${guests}/`],
    ['a non-UUID guest id', `${guests}/not-a-uuid`],
    [
      'a non-UUID event id on guests',
      '/api/v1/workspaces/personal/calendar/events/x/guests',
    ],
    ['the guest notification route', `${guests}/notify`],
    ['an encoded slash in the guest path', `${guests}%2F${guestId}`],
    ['a dot segment from a guest', `${guest}/../../x/y`],
    ['an encoded dot segment from a guest', `${guest}/%2e%2e/x/y`],
  ])('keeps %s blocked', async (_, path) => {
    const deps = dependencies();
    const response = await forwardCalendarRequest(request(path), deps);
    expect(response.status).toBe(404);
    expect(deps.verifyToken).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('still answers 401 without a verified session', async () => {
    for (const [path, method] of [
      [attendees, 'GET'],
      [guests, 'GET'],
      [guests, 'POST'],
      [guest, 'DELETE'],
    ] as const) {
      const init =
        method === 'POST' ? { method, body: '{}', headers: json } : { method };
      const missing = dependencies();
      expect(
        (await forwardCalendarRequest(request(path, init, false), missing))
          .status
      ).toBe(401);
      expect(missing.loadSecret).not.toHaveBeenCalled();
      expect(missing.fetch).not.toHaveBeenCalled();

      const rejected = dependencies();
      rejected.verifyToken.mockResolvedValue(false);
      expect(
        (await forwardCalendarRequest(request(path, init), rejected)).status
      ).toBe(401);
      expect(rejected.fetch).not.toHaveBeenCalled();
    }
  });
});
