import { redirect } from 'next/navigation';

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  redirect(`/${storeSlug}`);
}
