import { redirect } from 'next/navigation';
import { STOREFRONT_APP_URL } from '@/constants/common';

export default async function PublicStorefrontCartPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  redirect(`${STOREFRONT_APP_URL}/store/${storeSlug}/cart`);
}
