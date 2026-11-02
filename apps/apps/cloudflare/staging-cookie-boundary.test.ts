import { expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: vi.fn() },
}));
vi.mock('../src/native/api.server', () => ({ apiRequest: vi.fn() }));

import { type AppsEnvironment, appsRequest } from './worker';

it.each([
  ['apps.tutur3u.com', 500],
  ['apps.tuturuuu.com', 200],
])('enforces cookie scope on the Apps %s Worker exit', async (host, status) => {
  const cookie = 'session=fixture; Domain=.tuturuuu.com; Path=/; Secure';
  const env = {
    APPS_CANONICAL_HOST_ENABLED: '1',
    ASSETS: {
      fetch: async () =>
        new Response('asset', { headers: { 'set-cookie': cookie } }),
    },
  } satisfies AppsEnvironment;
  const response = await appsRequest(
    new Request(`https://${host}/assets/example.js`),
    env
  );
  expect(response.status).toBe(status);
  expect(response.headers.getSetCookie()).toEqual(
    status === 500 ? [] : [cookie]
  );
});
