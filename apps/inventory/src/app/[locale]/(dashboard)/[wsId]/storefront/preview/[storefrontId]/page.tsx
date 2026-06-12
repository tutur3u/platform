import { StorefrontPreviewPage } from '@/components/operator/storefront-preview-page';

export default async function InventoryStorefrontPreviewRoute({
  params,
}: {
  params: Promise<{ storefrontId: string; wsId: string }>;
}) {
  const { storefrontId, wsId } = await params;

  return <StorefrontPreviewPage storefrontId={storefrontId} wsId={wsId} />;
}
