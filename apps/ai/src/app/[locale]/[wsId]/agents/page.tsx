import { CatalogSection } from '@/components/catalog-section';

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  return <CatalogSection resource="agents" wsId={wsId} />;
}
