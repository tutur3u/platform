import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { expect, it, vi } from 'vitest';
import {
  getAuthUserIdentity,
  getExchangeUserProfile,
} from './external-app-exchange-profile';

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

it('never takes the exchange profile email from user_private_details (SR-926)', async () => {
  const sbAdmin = {
    from: vi.fn(() => {
      const builder = {
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({
          data: {
            avatar_url: null,
            display_name: null,
            id: 'actor',
            user_private_details: {
              email: 'sr926-profile-claim@attacker.example',
              full_name: null,
            },
          },
          error: null,
        })),
        select: vi.fn(() => builder),
      };
      return builder;
    }),
  } as unknown as TypedSupabaseClient;

  for (const authEmail of ['actor@example.com', null]) {
    const profile = await getExchangeUserProfile({
      authIdentity: { email: authEmail, metadata: null },
      sbAdmin,
      userId: 'actor',
    });

    expect(profile.email).toBe(authEmail);
    expect(JSON.stringify(profile)).not.toContain(
      'sr926-profile-claim@attacker.example'
    );
  }
});
