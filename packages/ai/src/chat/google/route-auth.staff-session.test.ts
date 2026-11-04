import { afterEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ getUserById: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(),
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));

import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isInternalTuturuuuAiUser } from './route-auth.js';

afterEach(() => vi.unstubAllEnvs());
it.each([
  ['staff@tuturuuu.com', true],
  ['staff@xwf.tuturuuu.com', false],
  ['staff@tuturuuu.com.example', false],
] as const)('Mira internal AI access for %s', async (email, expected) => {
  f.getUserById.mockResolvedValue({
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
  expect(
    await isInternalTuturuuuAiUser({
      ok: true,
      supabase: {} as TypedSupabaseClient,
      user: { id: 'actor' } as SupabaseUser,
    })
  ).toBe(expected);
});
