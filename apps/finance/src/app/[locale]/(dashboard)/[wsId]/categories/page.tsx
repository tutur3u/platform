import { notFound } from 'next/navigation';
import { getFinanceWorkspaceContext } from '@/lib/workspace';
import CategoriesTagsTabs from './categories-tags-tabs';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionCategoriesPage({
  params,
}: Props) {
  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();
  return <CategoriesTagsTabs wsId={context.wsId} currency={context.currency} />;
}
