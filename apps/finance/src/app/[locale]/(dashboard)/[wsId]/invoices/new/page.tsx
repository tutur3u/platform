import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function WorkspaceNewInvoicePage({ params }: Props) {
  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) {
    notFound();
  }

  return (
    <Suspense>
      <NewInvoicePage
        wsId={context.wsId}
        canCreateInvoices={context.permissions.containsPermission(
          'create_invoices'
        )}
        canChangeFinanceWallets={context.permissions.containsPermission(
          'change_finance_wallets'
        )}
        canSetFinanceWalletsOnCreate={context.permissions.containsPermission(
          'set_finance_wallets_on_create'
        )}
        permissionRequestUser={context.user}
      />
    </Suspense>
  );
}
