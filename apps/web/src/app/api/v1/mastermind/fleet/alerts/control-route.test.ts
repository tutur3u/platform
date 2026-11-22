import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('server-only', () => ({}));

const relay = vi.hoisted(() => vi.fn());
vi.mock('@opennextjs/cloudflare/cloudflare-context', () => ({
  getCloudflareContext: () => ({ env: { CRON_CONTROL: { fetch: relay } } }),
}));

afterEach(() => relay.mockReset());

const target = 'https://tuturuuu.com/api/v1/mastermind/fleet/alerts';
const authorization = `Bearer ${'a'.repeat(32)}`;

it('relays only a fixed stop request through the internal binding', async () => {
  relay.mockResolvedValue(Response.json({ state: { stopped: true } }));
  const result = await POST(
    new Request(`${target}?action=stop&job=unrelated`, {
      method: 'POST',
      headers: { authorization },
      body: 'discarded',
    })
  );
  expect(await result.json()).toEqual({ stopped: true });
  const [request] = relay.mock.calls[0]!;
  expect(request.url).toBe(
    'https://cron-control.internal/control/jobs/mobile-crashlytics-alerts/stop'
  );
  expect(request.method).toBe('POST');
  expect(request.headers.get('authorization')).toBe(authorization);
  expect(request.body).toBeNull();
});

it('passes through the operator denial and never claims an unconfirmed stop', async () => {
  expect((await POST(new Request(target, { method: 'POST' }))).status).toBe(
    404
  );
  expect(relay).not.toHaveBeenCalled();
  relay.mockResolvedValueOnce(new Response(null, { status: 404 }));
  relay.mockResolvedValueOnce(new Response(null, { status: 503 }));
  const send = () =>
    POST(
      new Request(`${target}?action=stop`, {
        method: 'POST',
        headers: { authorization },
      })
    );
  expect((await send()).status).toBe(404);
  expect((await send()).status).toBe(503);
});

it('allows a separately authorized resume and checks the ledger response', async () => {
  const send = () =>
    POST(
      new Request(`${target}?action=resume`, {
        method: 'POST',
        headers: { authorization },
      })
    );
  relay.mockResolvedValueOnce(Response.json({ state: { stopped: true } }));
  relay.mockResolvedValueOnce(Response.json({ state: { stopped: false } }));
  expect((await send()).status).toBe(503);
  expect(await (await send()).json()).toEqual({ stopped: false });
  expect(relay.mock.calls[1]?.[0].url).toMatch(
    /mobile-crashlytics-alerts\/resume$/
  );
});
