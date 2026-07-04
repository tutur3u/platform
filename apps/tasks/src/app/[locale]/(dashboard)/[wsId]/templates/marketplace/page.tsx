import TaskMarketplacePage from '@tuturuuu/ui/tu-do/templates/marketplace/task-marketplace-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MarketplacePage({ params }: Props) {
  await connection();

  return (
    <TaskMarketplacePage
      params={params}
      config={{ templatesBasePath: 'templates' }}
    />
  );
}
