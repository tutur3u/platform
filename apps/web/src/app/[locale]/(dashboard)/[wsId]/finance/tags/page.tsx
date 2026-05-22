import { notFound } from 'next/navigation';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';
import CategoriesTagsTabs from '../categories/categories-tags-tabs';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTagsPage({ params }: Props) {
  const { wsId: id } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context) notFound();

  return (
    <CategoriesTagsTabs
      wsId={context.wsId}
      currency={context.currency}
      defaultTab="tags"
    />
  );
}
