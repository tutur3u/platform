import InvoiceDetailsPage from '@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoice Details',
  description:
    'Manage Invoice Details in the Invoices area of your Tuturuuu workspace.',
};

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
