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

import { hasManagedCronAdminAccess } from './authorization';

describe('managed cron administrator', () => {
  beforeEach(() => {
    mocks.actor.mockResolvedValue({
      user: { id: 'actor', email: 'staff@tuturuuu.com' },
      admin: { auth: { admin: { getUserById: mocks.getUserById } } },
    });
  });
  it.each([
    ['staff@tuturuuu.com', true],
    ['staff@xwf.tuturuuu.com', false],
  ])('authorizes only exact-domain staff: %s', async (email, allowed) => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'actor',
          email,
          email_confirmed_at: '2026-01-01',
          identities: [{ provider: 'email', identity_data: {} }],
        },
      },
      error: null,
    });
    expect(await hasManagedCronAdminAccess()).toBe(allowed);
  });
});
