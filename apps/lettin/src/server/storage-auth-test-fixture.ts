import { vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: null }, error: null }),
      },
    },
  }),
}));
