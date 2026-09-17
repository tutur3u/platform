import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { PromotionsPage } from '@/components/promotions/promotions-page';
import { getFinanceWorkspaceContext } from '@/lib/workspace';
export default async function Page({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const context = await getFinanceWorkspaceContext(wsId);
  if (
    !context ||
    (context.permissions.withoutPermission('view_inventory') &&
      context.permissions.withoutPermission('create_invoices'))
  )
    notFound();
  return (
    <PromotionsPage
      key={context.wsId}
      wsId={context.wsId}
      currency={context.currency}
      canCreate={context.permissions.containsPermission('create_inventory')}
      canUpdate={context.permissions.containsPermission('update_inventory')}
      canDelete={context.permissions.containsPermission('delete_inventory')}
    />
  );
}
