function getUserMetadataValue(user: unknown, keys: string[]) {
  if (!user || typeof user !== 'object') return null;
  const metadata = (user as { user_metadata?: unknown }).user_metadata;
  if (!metadata || typeof metadata !== 'object') return null;

  for (const key of keys) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return null;
}

export function getCheckoutBuyerPayload(auth: {
  user: {
    email?: string | null;
    id: string;
    phone?: string | null;
    user_metadata?: unknown;
  };
}) {
  const email = auth.user.email?.trim();
  const name =
    getUserMetadataValue(auth.user, [
      'full_name',
      'name',
      'display_name',
      'preferred_name',
    ]) ??
    email ??
    'Tuturuuu buyer';

  return {
    customerAuthUid: auth.user.id,
    customerEmail: email ?? `${auth.user.id}@users.tuturuuu.local`,
    customerName: name,
    customerPhone:
      auth.user.phone ??
      getUserMetadataValue(auth.user, ['phone', 'phone_number']),
  };
}
