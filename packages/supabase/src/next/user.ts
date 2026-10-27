export type {
  AuthenticatorAssuranceLevels,
  JwtPayload as SupabaseJwtPayload,
  Session as SupabaseSession,
  User as SupabaseUser,
} from '@supabase/supabase-js';

import type { User } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '../types';

export function getConfirmedAuthEmail(
  user: Pick<User, 'email' | 'email_confirmed_at'>
): string | null {
  if (!user.email_confirmed_at) return null;
  return user.email?.trim().toLowerCase() || null;
}

/** Resolve mailbox authority from Auth, independently of profiles and session claims. */
export async function getVerifiedAuthEmail(
  admin: Pick<TypedSupabaseClient, 'auth'>,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user || data.user.id !== userId) {
    throw new Error('AUTH_IDENTITY_LOOKUP_FAILED');
  }
  return getConfirmedAuthEmail(data.user);
}
