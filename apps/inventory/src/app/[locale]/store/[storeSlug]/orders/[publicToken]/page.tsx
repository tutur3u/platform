import { redirect } from 'next/navigation';
import { STOREFRONT_APP_URL } from '@/constants/common';

export default async function PublicStorefrontOrderPage({
  params,
}: {
  params: Promise<{ publicToken: string; storeSlug: string }>;
}) {
  const { publicToken, storeSlug } = await params;
  redirect(`${STOREFRONT_APP_URL}/store/${storeSlug}/orders/${publicToken}`);
}
