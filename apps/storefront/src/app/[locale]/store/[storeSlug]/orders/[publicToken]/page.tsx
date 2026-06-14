import { redirect } from 'next/navigation';

export default async function StorefrontOrderPage({
  params,
}: {
  params: Promise<{ publicToken: string; storeSlug: string }>;
}) {
  const { publicToken, storeSlug } = await params;
  redirect(`/${storeSlug}/orders/${publicToken}`);
}
