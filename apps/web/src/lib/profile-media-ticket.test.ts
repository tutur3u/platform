import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ managed: vi.fn(), self: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/storage-core/profile-upload-budget', () => ({
  reserveProfileUploadBudget: f.self,
  reserveWorkspaceManagedAvatarBudget: f.managed,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/${path}` },
        }),
      }),
    },
  }),
}));
vi.mock('@tuturuuu/utils/app-coordination-token', () => ({
  createAppCoordinationToken: () => ({
    token: 'synthetic-token',
    claims: { jti: 'ticket-id' },
  }),
}));
vi.mock('./profile-media-public-url', () => ({
  publicStorageUrl: (url: string) => url,
}));

import { createOptimizedProfileMediaTicket } from './profile-media-ticket';

beforeEach(() => vi.clearAllMocks());

it('charges the managed budget only on the explicit workspace opt-in', async () => {
  await createOptimizedProfileMediaTicket(
    'actor',
    'avatar',
    'https://app.test',
    undefined,
    'ws-1/users',
    'ws-1'
  );
  expect(f.managed).toHaveBeenCalledWith('ws-1', 'actor');
  expect(f.self).not.toHaveBeenCalled();
});
it('keeps self-profile uploads on the self-profile budget', async () => {
  await createOptimizedProfileMediaTicket(
    'actor',
    'avatar',
    'https://app.test'
  );
  await createOptimizedProfileMediaTicket(
    'actor',
    'banner',
    'https://app.test'
  );
  expect(f.self).toHaveBeenCalledWith('actor', 'avatar');
  expect(f.self).toHaveBeenCalledWith('actor', 'banner');
  expect(f.managed).not.toHaveBeenCalled();
});
it('does not widen the budget for an avatar prefix alone, as the public profile-link route uses', async () => {
  await createOptimizedProfileMediaTicket(
    'link-actor',
    'avatar',
    'https://app.test',
    undefined,
    'ws-1/users/profile-link/code'
  );
  expect(f.self).toHaveBeenCalledWith('link-actor', 'avatar');
  expect(f.managed).not.toHaveBeenCalled();
});
it('never applies the managed budget to banners', async () => {
  await createOptimizedProfileMediaTicket(
    'actor',
    'banner',
    'https://app.test',
    undefined,
    undefined,
    'ws-1'
  );
  expect(f.self).toHaveBeenCalledWith('actor', 'banner');
  expect(f.managed).not.toHaveBeenCalled();
});
it('does not issue a ticket when the managed budget denies', async () => {
  f.managed.mockRejectedValue(new Error('denied'));
  await expect(
    createOptimizedProfileMediaTicket(
      'actor',
      'avatar',
      'https://app.test',
      undefined,
      'ws-1/users',
      'ws-1'
    )
  ).rejects.toThrow('denied');
});
