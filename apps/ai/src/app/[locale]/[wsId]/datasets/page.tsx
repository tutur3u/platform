import { CatalogSection } from '@/components/catalog-section';

export default async function DatasetsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <CatalogSection resource="datasets" wsId={wsId} />;
}
