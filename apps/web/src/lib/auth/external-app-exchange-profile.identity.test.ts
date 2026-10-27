import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { expect, it, vi } from 'vitest';
import { getAuthUserIdentity } from './external-app-exchange-profile';

it('does not return an unconfirmed mailbox as exchange identity', async () => {
  const sbAdmin = {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: {
            user: {
              id: 'actor',
              email: 'pending@example.com',
              email_confirmed_at: null,
            },
          },
          error: null,
        })),
      },
    },
  } as unknown as TypedSupabaseClient;
  expect(
    await getAuthUserIdentity({
      sbAdmin,
      userId: 'actor',
      sessionData: { email: 'caller@example.com' },
    })
  ).toMatchObject({ email: null });
});
