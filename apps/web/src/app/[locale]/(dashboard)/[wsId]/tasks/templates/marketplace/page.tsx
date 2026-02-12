import TaskMarketplacePage from '@tuturuuu/ui/tu-do/templates/marketplace/task-marketplace-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Template Marketplace',
  description: 'Discover templates from the community.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MarketplacePage({ params }: Props) {
  return (
    <TaskMarketplacePage
      params={params}
      config={{ templatesBasePath: 'tasks/templates' }}
    />
  );
}
