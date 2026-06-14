import { redirect } from 'next/navigation';

export default async function StorefrontCheckoutPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  redirect(`/${storeSlug}/checkout`);
}
