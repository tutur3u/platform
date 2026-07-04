import { redirect } from 'next/navigation';

export default async function StorefrontOrdersPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  redirect(`/${storeSlug}/orders`);
}
