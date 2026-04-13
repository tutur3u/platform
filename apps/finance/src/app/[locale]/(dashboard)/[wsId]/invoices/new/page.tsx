import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function WorkspaceNewInvoicePage({ params }: Props) {
  const { wsId: id } = await params;
  const [workspace, permissions] = await Promise.all([
    getWorkspace(id),
    getPermissions({ wsId: id }),
  ]);
  if (!workspace || !permissions) notFound();

  return (
    <Suspense>
      <NewInvoicePage
        wsId={workspace.id}
        canChangeFinanceWallets={permissions.containsPermission(
          'change_finance_wallets'
        )}
        canSetFinanceWalletsOnCreate={permissions.containsPermission(
          'set_finance_wallets_on_create'
        )}
      />
    </Suspense>
  );
}
