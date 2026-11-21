import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserProfile = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/users', () => ({ getCurrentUserProfile }));

import { fetchCurrentUserIdentity } from './use-current-user-identity';

describe('fetchCurrentUserIdentity', () => {
  beforeEach(() => {
    getCurrentUserProfile.mockReset();
  });

  it('returns only the id and email from the profile API', async () => {
    getCurrentUserProfile.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      display_name: 'Person',
    });
    await expect(fetchCurrentUserIdentity()).resolves.toEqual({
      id: 'user-1',
      email: 'person@example.com',
    });
  });

  it('resolves to null when signed out or the request fails', async () => {
    getCurrentUserProfile.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('Unauthorized'), { status: 401 }))
    );
    expect(await fetchCurrentUserIdentity()).toBeNull();
  });
});
