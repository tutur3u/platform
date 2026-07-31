import { CatalogSection } from '@/components/catalog-section';

export default async function PromptsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <CatalogSection resource="prompts" wsId={wsId} />;
}
