import InvoiceDetailsPage from '@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
    invoiceId: string;
    locale: string;
  }>;
}

export default async function WorkspaceInvoiceDetailsPage({ params }: Props) {
  await connection();

  const { wsId: id, invoiceId, locale } = await params;
  const context = await getFinanceWorkspaceContext(id);
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
