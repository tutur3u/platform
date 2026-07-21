import type { StorefrontBuyerDefaults } from '@tuturuuu/ui/storefront';
import { connection } from 'next/server';

type StorefrontBuyerProfile = {
  display_name?: string | null;
  email?: string | null;
  full_name?: string | null;
  name?: string | null;
};

function normalizeProfileValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function mapStorefrontBuyerDefaults(
  profile?: StorefrontBuyerProfile | null
): StorefrontBuyerDefaults | undefined {
  const email = normalizeProfileValue(profile?.email);
  const name =
    normalizeProfileValue(profile?.display_name) ??
    normalizeProfileValue(profile?.full_name) ??
    normalizeProfileValue(profile?.name) ??
    email;

  return email || name ? { email, name } : undefined;
}

export async function getStorefrontBuyerDefaults() {
  // Session-derived defaults are request-specific. Keep this access outside the
  // cached public catalog while allowing the catalog itself to remain tagged
  // and shared across visitors.
  await connection();
  const { getSatelliteCurrentUser } = await import('@tuturuuu/satellite/auth');
  const user = await getSatelliteCurrentUser('storefront').catch(() => null);
  return mapStorefrontBuyerDefaults(user);
}
