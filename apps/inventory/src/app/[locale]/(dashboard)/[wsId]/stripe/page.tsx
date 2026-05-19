import { redirect } from 'next/navigation';

export default async function InventoryStripePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/storefront`);
}
