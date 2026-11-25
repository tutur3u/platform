import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ actor: vi.fn(), update: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: f.actor,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { updateUserById: f.update } },
  }),
}));

import { POST } from './route';

const origin = 'https://meet.test';
const account = '0b1e0d1c-2f3a-4b5c-8d6e-7f8091a2b3c4';
const marker = 'meet_mira_account_confirmation';

const post = (expectedActorId = account, requestOrigin = origin) =>
  POST(
    new Request(origin + '/api/meet-mira/account', {
      method: 'POST',
      headers: { origin: requestOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedActorId }),
    })
  );

beforeEach(() => {
  vi.resetAllMocks();
  f.actor.mockResolvedValue({ id: account });
  f.update.mockResolvedValue({
    data: { user: { id: account, app_metadata: {} } },
    error: null,
  });
});

it('withdraws only the signed-in account marker without a meeting id', async () => {
  const response = await post();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(f.actor).toHaveBeenCalledWith('meet');
  expect(f.update).toHaveBeenCalledExactlyOnceWith(account, {
    app_metadata: { [marker]: null },
  });
});

it('rejects a cross-origin request, a changed account, and a missing session', async () => {
  expect((await post(account, 'https://other.test')).status).toBe(403);
  expect(f.actor).not.toHaveBeenCalled();
  expect((await post('0b1e0d1c-2f3a-4b5c-8d6e-7f8091a2b3c5')).status).toBe(403);
  f.actor.mockResolvedValue(null);
  expect((await post()).status).toBe(401);
  expect(f.update).not.toHaveBeenCalled();
});
