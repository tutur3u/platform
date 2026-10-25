import { beforeEach, expect, it, vi } from 'vitest';

const dispatch = vi.hoisted(() => vi.fn());
vi.mock('../proxy', () => ({ proxy: vi.fn() }));
vi.mock('./api-registry.bridge.gen', () => ({ endpoints: [] }));
vi.mock('./mail-api-server', () => ({ registerMailServerApiPaths: () => {} }));
vi.mock('@tuturuuu/start-bridge/start/handler', () => ({
  createBridgeHandler: () => dispatch,
}));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: vi.fn() }),
}));

import { handleMailRequest } from './handler';

const env = { ASSETS: { fetch: vi.fn() } };
const ctx = { waitUntil: () => {} };
beforeEach(() => dispatch.mockReset());
it.each(['refresh-app-session', 'verify-app-token', 'logout'])(
  'blocks mounted %s before a session-writing handler can run',
  async (endpoint) => {
    const response = await handleMailRequest(
      new Request(`https://tuturuuu.com/mail/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { cookie: 'sb-fixture-auth-token=shared' },
      }),
      env,
      ctx
    );
    expect(response.status).toBe(409);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  }
);
it.each(['refresh-app-session', 'verify-app-token', 'logout'])(
  'retains subdomain %s behavior',
  async (endpoint) => {
    const owner = new Response('root handler', {
      headers: {
        'set-cookie': 'tuturuuu_app_session=fixture; Path=/; HttpOnly',
      },
    });
    dispatch.mockResolvedValueOnce(owner);
    const response = await handleMailRequest(
      new Request(`https://mail.tuturuuu.com/api/auth/${endpoint}`, {
        method: 'POST',
      }),
      env,
      ctx
    );
    expect(await response.text()).toBe('root handler');
    expect(response.headers.getSetCookie()).toEqual(
      owner.headers.getSetCookie()
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
  }
);
