import { redirect } from 'next/navigation';

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ listingId: string; storeSlug: string }>;
}) {
  const { listingId, storeSlug } = await params;
  redirect(`/${storeSlug}/products/${listingId}`);
}
