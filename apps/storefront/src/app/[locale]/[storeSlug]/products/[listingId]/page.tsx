import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getStorefrontBuyerDefaults } from '@/components/storefront/buyer-defaults';
import { StorefrontClient } from '@/components/storefront/storefront-client';
import { getOptionalInventoryPublicStorefront } from '@/components/storefront/storefront-loader';
import { INVENTORY_APP_URL } from '@/constants/common';
import { siteConfig } from '@/constants/configs';
import { StorefrontHeaderActions } from '../../../storefront-header-actions';

interface Props {
  params: Promise<{
    listingId: string;
    locale: string;
    storeSlug: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { listingId, locale, storeSlug } = await params;
  const response = await getOptionalInventoryPublicStorefront(storeSlug, {
    baseUrl: INVENTORY_APP_URL,
  }).catch(() => null);
  const listing = response?.listings.find((item) => item.id === listingId);
  const storefront = response?.storefront;

  return createPageMetadata({
    baseUrl: siteConfig.url,
    description:
      listing?.description ||
      `View ${listing?.title ?? 'this product'} from ${storefront?.name ?? storeSlug}.`,
    image: listing?.imageUrl || storefront?.heroImageUrl || undefined,
    indexable: Boolean(listing && storefront),
    locale,
    pathname: `/${storeSlug}/products/${listingId}`,
    siteName: storefront?.name ?? siteConfig.name,
    title: listing
      ? `${listing.title} - ${storefront?.name ?? 'Tuturuuu Storefront'}`
      : 'Product unavailable',
  });
}

export default async function StorefrontProductPage({ params }: Props) {
  const { listingId, storeSlug } = await params;
  const buyerDefaults = await getStorefrontBuyerDefaults();

  return (
    <StorefrontClient
      buyerDefaults={buyerDefaults}
      headerActions={<StorefrontHeaderActions storeSlug={storeSlug} />}
      listingId={listingId}
      mode="product"
      storeSlug={storeSlug}
    />
  );
}
