import { redirect } from 'next/navigation';

export default async function InventoryPolarPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/payments`);
}
