import { redirect } from 'next/navigation';
import { getInventoryAppOrigin } from '@/lib/inventory-app-url';

interface PageProps {
  params: Promise<{ wsId: string }>;
}

// Inventory management has moved to the dedicated inventory app (apps/inventory).
// This catch-all redirects any legacy /[wsId]/inventory/* link to the standalone
// operator console for the workspace.
export default async function InventoryRedirectPage({ params }: PageProps) {
  const { wsId } = await params;
  redirect(`${getInventoryAppOrigin()}/${wsId}`);
}
