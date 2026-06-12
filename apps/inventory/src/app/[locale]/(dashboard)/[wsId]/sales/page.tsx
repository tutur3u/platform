import { redirect } from 'next/navigation';

export default async function InventorySalesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/commerce?tab=sales`);
}
