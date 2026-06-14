import { redirect } from 'next/navigation';
import { STOREFRONT_APP_URL } from '@/constants/common';

export default async function PublicStorefrontProductPage({
  params,
}: {
  params: Promise<{ listingId: string; storeSlug: string }>;
}) {
  const { listingId, storeSlug } = await params;
  redirect(`${STOREFRONT_APP_URL}/${storeSlug}/products/${listingId}`);
}
