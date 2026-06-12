import { redirect } from 'next/navigation';

export default async function InventoryCheckoutPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/commerce?tab=checkouts`);
}
