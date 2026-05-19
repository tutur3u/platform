import { redirect } from 'next/navigation';

export default async function InventoryItemsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/catalog`);
}
