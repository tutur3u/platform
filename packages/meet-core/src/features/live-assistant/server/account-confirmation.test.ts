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
import {
  isMiraAccountMissing,
  readMiraAccountConfirmation,
  readMiraConfirmedAt,
} from './account-confirmation';

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

it('marks a deleted account apart from an Auth outage', async () => {
  f.getUserById.mockResolvedValueOnce({
    data: { user: null },
    error: { status: 404, code: 'user_not_found' },
  });
  const deleted = await readMiraConfirmedAt('deleted-account').catch(
    (error: unknown) => error
  );
  expect(deleted).toBeInstanceOf(Error);
  expect(isMiraAccountMissing(deleted)).toBe(true);

  f.getUserById.mockResolvedValueOnce({
    data: { user: null },
    error: { status: 500, code: 'unexpected_failure' },
  });
  const outage = await readMiraConfirmedAt('outage-account').catch(
    (error: unknown) => error
  );
  expect(outage).toBeInstanceOf(Error);
  expect(isMiraAccountMissing(outage)).toBe(false);
});
