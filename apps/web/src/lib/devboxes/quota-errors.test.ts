import { expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import {
  createDevboxRouteErrorResponse,
  getDevboxStorageError,
} from './store-utils';

it.each([
  ['DEVBOX_LIMIT_REACHED', 429],
  ['DEVBOX_LIMIT_EXCEEDS_GRANT', 422],
])('serializes %s', async (code, status) => {
  const detail = {
    limit: 'cpu_minutes_daily',
    used: 480,
    max: 480,
    resetsAt: '2026-10-28T17:00:00+00:00',
  };
  const response = createDevboxRouteErrorResponse(
    getDevboxStorageError({
      message: String(code),
      details: JSON.stringify(detail),
    }),
    'fallback'
  );
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({
    ...detail,
    code,
    messages: { en: expect.any(String), vi: expect.any(String) },
  });
});
