import TaskMarketplacePage from '@tuturuuu/ui/tu-do/templates/marketplace/task-marketplace-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MarketplacePage({ params }: Props) {
  return (
    <TaskMarketplacePage
      params={params}
      config={{ templatesBasePath: 'templates' }}
    />
  );
}
