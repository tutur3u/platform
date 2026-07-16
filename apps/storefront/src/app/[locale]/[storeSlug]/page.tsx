import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getStorefrontBuyerDefaults } from '@/components/storefront/buyer-defaults';
import { StorefrontClient } from '@/components/storefront/storefront-client';
import { getOptionalInventoryPublicStorefront } from '@/components/storefront/storefront-loader';
import { INVENTORY_APP_URL } from '@/constants/common';
import { siteConfig } from '@/constants/configs';
import { StorefrontHeaderActions } from '../storefront-header-actions';

interface Props {
  params: Promise<{ locale: string; storeSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { locale, storeSlug } = await params;
  const response = await getOptionalInventoryPublicStorefront(storeSlug, {
    baseUrl: INVENTORY_APP_URL,
  }).catch(() => null);
  const storefront = response?.storefront;

  return createPageMetadata({
    baseUrl: siteConfig.url,
    description:
      storefront?.description ||
      `Browse products and shop securely from ${storefront?.name ?? storeSlug}.`,
    image: storefront?.heroImageUrl || storefront?.coverImageUrl || undefined,
    indexable: Boolean(storefront),
    locale,
    pathname: `/${storeSlug}`,
    siteName: storefront?.name ?? siteConfig.name,
    title: storefront?.name ?? 'Storefront unavailable',
  });
}

export default async function StorefrontPage({ params }: Props) {
  await connection();
  const { storeSlug } = await params;
  // Resolve the storefront on the server so the first paint already has data.
  // Falls back to null (client query still runs) if the server fetch fails.
  const [buyerDefaults, initialStorefront] = await Promise.all([
    getStorefrontBuyerDefaults(),
    getOptionalInventoryPublicStorefront(storeSlug, {
      baseUrl: INVENTORY_APP_URL,
    }).catch(() => null),
  ]);

  return (
    <StorefrontClient
      buyerDefaults={buyerDefaults}
      headerActions={
        <StorefrontHeaderActions
          storefront={initialStorefront?.storefront ?? null}
          storeSlug={storeSlug}
        />
      }
      initialStorefront={initialStorefront}
      mode="store"
      storeSlug={storeSlug}
    />
  );
}
