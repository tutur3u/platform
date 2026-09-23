import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { ExchangeUserProfile } from './external-app-exchange-response';

export type AuthUserIdentity = {
  email: string | null;
  metadata: Record<string, unknown> | null;
};

type UserPrivateDetailsRow = {
  email?: string | null;
  full_name?: string | null;
};

type UserProfileRow = {
  avatar_url?: string | null;
  display_name?: string | null;
  id?: string | null;
  user_private_details?: UserPrivateDetailsRow | UserPrivateDetailsRow[] | null;
};

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstCleanString(...values: unknown[]) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPrivateDetails(
  value: UserProfileRow['user_private_details']
): UserPrivateDetailsRow | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getUserProfileRow(value: unknown): UserProfileRow | null {
  if (!isRecord(value)) {
    return null;
  }

  return value as UserProfileRow;
}

export async function getAuthUserIdentity({
  sbAdmin,
  sessionData,
  userId,
}: {
  sbAdmin: TypedSupabaseClient;
  sessionData: { email?: unknown } | null | undefined;
  userId: string;
}): Promise<AuthUserIdentity> {
  void sessionData;
  const { data, error } = await sbAdmin.auth.admin.getUserById(userId);

  if (error || !data.user || data.user.id !== userId) {
    console.warn('Failed to fetch app token auth user profile', {
      error: error?.message,
      userId,
    });

    throw new Error('Unable to verify app account identity');
  }

  return {
    email: cleanString(data.user.email),
    metadata: isRecord(data.user?.user_metadata)
      ? data.user.user_metadata
      : null,
  };
}

export async function getExchangeUserProfile({
  authIdentity,
  sbAdmin,
  userId,
}: {
  authIdentity: AuthUserIdentity;
  sbAdmin: TypedSupabaseClient;
  userId: string;
}): Promise<ExchangeUserProfile> {
  const { data, error } = await sbAdmin
    .from('users')
    .select(
      'id, display_name, avatar_url, user_private_details(email, full_name)'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to fetch app token user profile', {
      error: error.message,
      userId,
    });
  }

  const userProfile = error ? null : getUserProfileRow(data);
  const privateDetails = getPrivateDetails(userProfile?.user_private_details);
  const displayName = firstCleanString(
    userProfile?.display_name,
    authIdentity.metadata?.display_name
  );
  const fullName = firstCleanString(
    privateDetails?.full_name,
    authIdentity.metadata?.full_name
  );
  const email = firstCleanString(privateDetails?.email, authIdentity.email);
  const avatarUrl = firstCleanString(
    userProfile?.avatar_url,
    authIdentity.metadata?.avatar_url
  );

  return {
    avatarUrl,
    avatar_url: avatarUrl,
    displayName,
    display_name: displayName,
    email,
    fullName,
    full_name: fullName,
    id: firstCleanString(userProfile?.id) ?? userId,
    name: firstCleanString(displayName, fullName, email),
  };
}
