import { vi } from 'vitest';

export function createAuthenticatedSupabaseClient(
  user: { email?: string; id: string } = {
    email: 'member@example.com',
    id: 'user-1',
  }
) {
  const emptyMaybeSingleBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: user && {
            ...user,
            email_confirmed_at: '2026-01-01',
            identities: [],
          },
        },
      }),
    },
    from: vi.fn(() => emptyMaybeSingleBuilder),
  };
}
