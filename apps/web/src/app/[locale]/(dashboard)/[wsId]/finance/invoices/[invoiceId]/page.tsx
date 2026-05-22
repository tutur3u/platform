import InvoiceDetailsPage from '@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface Props {
  params: Promise<{
    wsId: string;
    invoiceId: string;
    locale: string;
  }>;
}

export default async function WorkspaceInvoiceDetailsPage({ params }: Props) {
  const { wsId: id, invoiceId, locale } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context || context.permissions.withoutPermission('view_invoices')) {
    notFound();
  }

  return (
    <Suspense>
      <InvoiceDetailsPage
        wsId={context.wsId}
        invoiceId={invoiceId}
        locale={locale}
        canUpdateInvoices={context.permissions.containsPermission(
          'update_invoices'
        )}
        canChangeFinanceWallets={context.permissions.containsPermission(
          'change_finance_wallets'
        )}
        currency={context.currency}
      />
    </Suspense>
  );
}
