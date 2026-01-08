import InvoiceDetailsPage from '@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    invoiceId: string;
    locale: string;
  }>;
}

export default async function WorkspaceInvoiceDetailsPage({ params }: Props) {
  const { wsId, invoiceId, locale } = await params;

  return (
    <Suspense>
      <InvoiceDetailsPage
        wsId={wsId}
        invoiceId={invoiceId}
        locale={locale}
        canUpdateInvoices
      />
    </Suspense>
  );
}
