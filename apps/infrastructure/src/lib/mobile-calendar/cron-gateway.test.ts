// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { forwardCalendarCron } from './cron-gateway';

const path = '/api/cron/calendar/provider-sync';
const request = (route = path, authorization = 'Bearer cron') =>
  new Request(`https://infrastructure.tuturuuu.com${route}`, {
    headers: {
      Authorization: authorization,
      Cookie: 'private-cookie',
      'x-tuturuuu-calendar-gateway': 'forged',
    },
  });
function dependencies() {
  return {
    cronSecret: 'cron',
    loadSecret: vi.fn(async () => 'a'.repeat(43)),
    fetch: vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ ok: true })),
  };
}

describe('vault-backed scheduled Calendar gateway', () => {
  it.each(['', 'Bearer invalid', 'Basic cron'])(
    'rejects invalid authentication %s before vault access',
    async (authorization) => {
      const deps = dependencies();
      expect(
        (await forwardCalendarCron(request(path, authorization), deps)).status
      ).toBe(401);
      expect(deps.loadSecret).not.toHaveBeenCalled();
      expect(deps.fetch).not.toHaveBeenCalled();
    }
  );
  it.each(['provider-sync', 'smart-schedule'])(
    'forwards only the authorized job %s without client cookies or forged headers',
    async (job) => {
      const deps = dependencies();
      expect(
        (
          await forwardCalendarCron(
            request(`/api/cron/calendar/${job}?redirect=evil`),
            deps
          )
        ).status
      ).toBe(200);
      expect(deps.fetch).toHaveBeenCalledWith(
        `https://calendar.tuturuuu.com/api/cron/calendar/${job}`,
        expect.objectContaining({
          method: 'GET',
          redirect: 'manual',
          cache: 'no-store',
          headers: {
            Authorization: 'Bearer cron',
            Accept: 'application/json',
            'x-tuturuuu-calendar-gateway': 'a'.repeat(43),
          },
        })
      );
    }
  );
  it('never turns cron authentication into arbitrary forwarding access', async () => {
    const deps = dependencies();
    expect(
      (await forwardCalendarCron(request('/api/cron/calendar/other'), deps))
        .status
    ).toBe(404);
    expect(
      (
        await forwardCalendarCron(
          new Request(`https://infrastructure.tuturuuu.com${path}`, {
            method: 'POST',
          }),
          deps
        )
      ).status
    ).toBe(405);
    expect(deps.loadSecret).not.toHaveBeenCalled();
  });
  it('fails closed when server authentication or the vault is unavailable', async () => {
    const deps = dependencies();
    expect(
      (await forwardCalendarCron(request(), { ...deps, cronSecret: undefined }))
        .status
    ).toBe(503);
    deps.loadSecret.mockRejectedValue(new Error('private database detail'));
    const response = await forwardCalendarCron(request(), deps);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database detail');
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each([
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.example' },
      }),
    () =>
      new Response('<html>challenge</html>', {
        status: 429,
        headers: { 'Content-Type': 'text/html' },
      }),
    () =>
      new Response('x'.repeat(1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
  ])(
    'rejects redirects, challenges, and oversized responses',
    async (upstream) => {
      const deps = dependencies();
      deps.fetch.mockResolvedValue(upstream());
      expect((await forwardCalendarCron(request(), deps)).status).toBe(502);
      expect(deps.fetch).toHaveBeenCalledTimes(1);
    }
  );
  it('preserves job failure status without forwarding upstream cookies', async () => {
    const deps = dependencies();
    deps.fetch.mockResolvedValue(
      Response.json(
        { ok: false, failed: 1 },
        { status: 502, headers: { 'Set-Cookie': 'private' } }
      )
    );
    const response = await forwardCalendarCron(request(), deps);
    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
