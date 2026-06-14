import { redirect } from 'next/navigation';

export default async function StorefrontCheckoutCancelPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  redirect(`/${storeSlug}/cart`);
}
