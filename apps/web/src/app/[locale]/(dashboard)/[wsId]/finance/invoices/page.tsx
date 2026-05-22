import InvoicesPage from '@tuturuuu/ui/finance/invoices/invoice-page';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
    start: string;
    end: string;
    userIds: string | string[];
    walletIds: string | string[];
    walletId: string;
  }>;
}

export default async function WorkspaceInvoicesPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context || context.permissions.withoutPermission('view_invoices')) {
    notFound();
  }

  return (
    <Suspense>
      <InvoicesPage
        params={Promise.resolve({ wsId: context.wsId })}
        searchParams={searchParams}
        canCreateInvoices={context.permissions.containsPermission(
          'create_invoices'
        )}
        canDeleteInvoices={context.permissions.containsPermission(
          'delete_invoices'
        )}
        currency={context.currency}
        financePrefix="/finance"
        permissions={context.permissions}
        userId={context.user.id}
        workspace={context.workspace}
      />
    </Suspense>
  );
}
