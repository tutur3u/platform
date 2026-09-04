import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { StorefrontRouteFromParams } from '@/components/storefront/storefront-route';
import { getServerInventoryStorefront } from '@/components/storefront/storefront-server-loader';
import { siteConfig } from '@/constants/configs';

interface Props {
  params: Promise<{ locale: string; storeSlug: string }>;
}

// Buyer defaults are resolved from the request session. Next 16.3 instant
// validation can otherwise turn client navigation into the recovery boundary
// even though the request-specific content is wrapped in Suspense.
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, storeSlug } = await params;
  const response = await getServerInventoryStorefront(storeSlug);
  const storefront = response?.storefront;

  return createPageMetadata({
    baseUrl: siteConfig.url,
    description:
      storefront?.description ||
      `Browse products and shop securely from ${storefront?.name ?? storeSlug}.`,
    image: storefront?.heroImageUrl || storefront?.coverImageUrl || undefined,
    indexable: Boolean(storefront),
    locale,
    localePrefix: 'never',
    pathname: `/${storeSlug}`,
    siteName: storefront?.name ?? siteConfig.name,
    title: storefront?.name ?? 'Storefront unavailable',
  });
}

export default function StorefrontPage({ params }: Props) {
  return (
    <StorefrontRouteFromParams
      mode="store"
      params={params}
      showHeaderActions={false}
      withinSharedShell
    />
  );
}
