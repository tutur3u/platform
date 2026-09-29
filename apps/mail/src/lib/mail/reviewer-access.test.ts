import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { isManagedMailReviewer } from './reviewer-access';

const identity = { id: 'reviewer-1', email: 'app-review-ios@tutur3u.com' };

describe('Mail reviewer access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({
      auth: { admin: { getUserById: mocks.getUserById } },
    });
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          email: identity.email,
          email_confirmed_at: '2026-09-29T00:00:00Z',
          app_metadata: { infrastructure_review_account: { kind: 'review' } },
          banned_until: null,
        },
      },
      error: null,
    });
  });

  it('requires the non-staff domain and a current server-side reviewer tag', async () => {
    await expect(isManagedMailReviewer(identity)).resolves.toBe(true);
    expect(mocks.getUserById).toHaveBeenCalledWith(identity.id);
    await expect(
      isManagedMailReviewer({ id: identity.id, email: 'review@tuturuuu.com' })
    ).resolves.toBe(false);
    expect(mocks.getUserById).toHaveBeenCalledTimes(1);
  });

  it.each([
    { app_metadata: {}, email: identity.email },
    {
      app_metadata: { infrastructure_review_account: { kind: 'external' } },
      email: identity.email,
    },
    {
      app_metadata: { infrastructure_review_account: { kind: 'review' } },
      email: 'other@tutur3u.com',
    },
    {
      app_metadata: { infrastructure_review_account: { kind: 'review' } },
      email: identity.email,
      banned_until: '2099-01-01T00:00:00Z',
    },
    {
      app_metadata: { infrastructure_review_account: { kind: 'review' } },
      email: identity.email,
      email_confirmed_at: null,
    },
  ])('rejects a stale or ineligible reviewer record %#', async (override) => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          email: identity.email,
          email_confirmed_at: '2026-09-29T00:00:00Z',
          banned_until: null,
          ...override,
        },
      },
      error: null,
    });
    await expect(isManagedMailReviewer(identity)).resolves.toBe(false);
  });
});
