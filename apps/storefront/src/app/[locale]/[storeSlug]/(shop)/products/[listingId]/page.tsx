import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { StorefrontRouteFromParams } from '@/components/storefront/storefront-route';
import { getServerInventoryStorefront } from '@/components/storefront/storefront-server-loader';
import { siteConfig } from '@/constants/configs';

interface Props {
  params: Promise<{
    listingId: string;
    locale: string;
    storeSlug: string;
  }>;
}

// Buyer defaults are resolved from the request session. Next 16.3 instant
// validation can otherwise turn client navigation into the recovery boundary
// even though the request-specific content is wrapped in Suspense.
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { listingId, locale, storeSlug } = await params;
  const response = await getServerInventoryStorefront(storeSlug);
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
    localePrefix: 'never',
    pathname: `/${storeSlug}/products/${listingId}`,
    siteName: storefront?.name ?? siteConfig.name,
    title: listing
      ? `${listing.title} - ${storefront?.name ?? 'Tuturuuu Storefront'}`
      : 'Product unavailable',
  });
}

export default function StorefrontProductPage({ params }: Props) {
  return (
    <StorefrontRouteFromParams
      mode="product"
      params={params}
      showHeaderActions={false}
      withinSharedShell
    />
  );
}
