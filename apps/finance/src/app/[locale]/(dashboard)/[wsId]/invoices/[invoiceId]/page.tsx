import InvoiceDetailsPage from '@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    invoiceId: string;
    locale: string;
  }>;
}

export default async function WorkspaceInvoiceDetailsPage({ params }: Props) {
  const { wsId: id, invoiceId, locale } = await params;
  const [workspace, permissions] = await Promise.all([
    getWorkspace(id),
    getPermissions({ wsId: id }),
  ]);
  if (!workspace || !permissions) notFound();

  return (
    <Suspense>
      <InvoiceDetailsPage
        wsId={workspace.id}
        invoiceId={invoiceId}
        locale={locale}
        canUpdateInvoices={permissions.containsPermission('update_invoices')}
        canChangeFinanceWallets={permissions.containsPermission(
          'change_finance_wallets'
        )}
      />
    </Suspense>
  );
}
