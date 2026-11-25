import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ getUserById: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('../../call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {},
}));

import type { MeetCallRouteAccess } from '../../call/server/room-service';
import {
  MIRA_ACCOUNT_CONFIRMATION_KEY,
  MIRA_ACCOUNT_CONFIRMATION_VERSION,
} from '../account-confirmation';
import { readMiraAccountConfirmation } from './account-confirmation';

const access = { user: { id: 'account' } } as MeetCallRouteAccess;
const reply = (id: string) => ({
  data: {
    user: {
      id,
      app_metadata: {
        [MIRA_ACCOUNT_CONFIRMATION_KEY]: MIRA_ACCOUNT_CONFIRMATION_VERSION,
      },
    },
  },
});

beforeEach(() => vi.resetAllMocks());

it('reports a guest without querying Auth', async () => {
  await expect(
    readMiraAccountConfirmation({
      ...access,
      guest: true,
    } as MeetCallRouteAccess)
  ).resolves.toBe('guest');
  expect(f.getUserById).not.toHaveBeenCalled();
});

it('fails closed on unavailable and mismatched Auth reads and caches only success', async () => {
  f.getUserById
    .mockRejectedValueOnce(new Error('Auth unavailable'))
    .mockResolvedValueOnce({ data: { user: null }, error: new Error('Failed') })
    .mockResolvedValueOnce(reply('another-account'))
    .mockResolvedValueOnce(reply(access.user.id));

  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(readMiraAccountConfirmation(access)).resolves.toBe(
      'unavailable'
    );
  }
  await expect(readMiraAccountConfirmation(access)).resolves.toBe('confirmed');
  await expect(readMiraAccountConfirmation(access)).resolves.toBe('confirmed');
  expect(f.getUserById).toHaveBeenCalledTimes(4);
});
