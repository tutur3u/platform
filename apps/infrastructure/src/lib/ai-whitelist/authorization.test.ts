vi.mock('server-only', () => ({}));

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ actor: vi.fn(), getUserById: vi.fn() }));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatellitePageActor: mocks.actor,
  resolveSatelliteRequestActor: mocks.actor,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(async () => ({
    membershipType: 'MEMBER',
    containsPermission: () => true,
  })),
}));

import { hasAIWhitelistAccess } from './authorization';

describe('AI whitelist verified email', () => {
  beforeEach(() => {
    mocks.actor.mockResolvedValue({
      user: { id: 'actor', email: 'staff@tuturuuu.com' },
      admin: { auth: { admin: { getUserById: mocks.getUserById } } },
    });
  });
  it.each([
    ['staff@tuturuuu.com', '2026-01-01', true],
    ['outside@example.com', '2026-01-01', false],
    ['staff@tuturuuu.com', null, false],
    ['Staff@Tuturuuu.com', '2026-01-01', false],
    ['staff@xwf.tuturuuu.com', '2026-01-01', false],
  ])(
    'authorizes only confirmed canonical staff email',
    async (email, confirmed, allowed) => {
      mocks.getUserById.mockResolvedValue({
        data: {
          user: {
            id: 'actor',
            email,
            email_confirmed_at: confirmed,
            identities: [{ provider: 'email', identity_data: {} }],
          },
        },
        error: null,
      });
      expect(await hasAIWhitelistAccess()).toBe(allowed);
    }
  );
});
