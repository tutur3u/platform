import InvoiceDetailsPage from '@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page';

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
    <InvoiceDetailsPage wsId={wsId} invoiceId={invoiceId} locale={locale} />
  );
}
