import type { StorefrontBuyerDefaults } from '@tuturuuu/ui/storefront';

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
  const { getSatelliteCurrentUser } = await import('@tuturuuu/satellite/auth');
  const user = await getSatelliteCurrentUser('storefront').catch(() => null);
  return mapStorefrontBuyerDefaults(user);
}
