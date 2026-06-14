import { redirect } from 'next/navigation';

export default async function StorefrontCartPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  redirect(`/${storeSlug}/cart`);
}
